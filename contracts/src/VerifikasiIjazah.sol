// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.28;

import {FHE, euint256, externalEuint256, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Registry, immutable encrypted credentials and attested private comparisons.
/// @dev No plaintext attributes or attribute digests ever enter this contract.
contract VerifikasiIjazah is ZamaEthereumConfig, AccessControl, EIP712 {
    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant RESULT_READER_ROLE = keccak256("RESULT_READER_ROLE");
    string public constant SCHEMA_VERSION = "academic-diploma-v1";
    string public constant ENCODING_VERSION = "sha256-euint256-v1";
    string public constant NORMALIZER_VERSION = "academic-normalizer-v1";
    bytes32 public constant VERIFICATION_TYPEHASH = keccak256(
        "Verification(bytes32 requestId,bytes32 credentialId,bytes32 uploadCommitment,string schemaVersion,string encodingVersion,string normalizerVersion,bytes32 ocrConfigHash,bytes32 inputHandlesHash,address relayer,address resultReader,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant CREDENTIAL_AUTHORIZATION_TYPEHASH = keccak256(
        "CredentialAuthorization(bytes32 credentialId,bytes32 issuerId,address signer,bytes32 publicDataHash,bytes32 encryptedAttributesHash,uint32 schemaVersion,uint32 encodingVersion,uint32 disclosurePolicyVersion,uint256 nonce,uint256 issuanceDeadline)"
    );

    struct Issuer { string name; bool active; bool exists; }
    struct SignerAuthorization { bytes32 issuerId; address signer; uint64 authorizedAt; uint64 revokedAt; }
    struct CredentialAuthorization {
        bytes32 credentialId;
        bytes32 issuerId;
        address signer;
        bytes32 publicDataHash;
        bytes32 encryptedAttributesHash;
        uint32 schemaVersion;
        uint32 encodingVersion;
        uint32 disclosurePolicyVersion;
        uint256 nonce;
        uint256 issuanceDeadline;
    }
    struct Credential {
        bytes32 issuerId;
        address signer;
        uint64 issuedAt;
        uint64 revokedAt;
        uint64 issuedBlock;
        uint64 revokedBlock;
        uint64 signerAuthorizationId;
        uint32 schemaVersion;
        uint32 encodingVersion;
        uint32 disclosurePolicyVersion;
        bytes32 credentialDigest;
        bytes32 publicDataHash;
        bytes32 encryptedAttributesHash;
        bytes32 issuerNameHash;
        euint256[4] attributes;
    }
    struct Verification {
        bytes32 requestId;
        bytes32 credentialId;
        bytes32 uploadCommitment;
        string schemaVersion;
        string encodingVersion;
        string normalizerVersion;
        bytes32 ocrConfigHash;
        bytes32 inputHandlesHash;
        address relayer;
        address resultReader;
        uint256 nonce;
        uint256 deadline;
    }
    struct Comparison {
        bytes32 credentialId;
        bytes32 uploadCommitment;
        address resultReader;
        uint64 comparedAt;
        ebool[4] fields;
        ebool allMatch;
    }
    mapping(bytes32 => Issuer) public issuers;
    mapping(uint64 => SignerAuthorization) public signerAuthorizations;
    mapping(address => uint64) public signerAuthorizationIds;
    uint64 public signerAuthorizationCount;
    mapping(bytes32 => Credential) private credentials;
    mapping(bytes32 => bytes32[]) private issuerCredentials;
    mapping(bytes32 => Comparison) private comparisons;
    mapping(bytes32 => bool) public requestUsed;
    mapping(address => mapping(uint256 => bool)) public nonceUsed;
    mapping(address => mapping(uint256 => bool)) public issuanceNonceUsed;

    error UnauthorizedIssuer();
    error InvalidCredential();
    error CredentialAlreadyExists();
    error CredentialInactive();
    error InvalidAttestation();
    error ExpiredAttestation();
    error ReplayedRequest();
    error ReplayedNonce();
    error InvalidVersion();
    error InvalidAddress();
    error InvalidCredentialAuthorization();
    error ExpiredCredentialAuthorization();
    event IssuerUpdated(bytes32 indexed issuerId, string name, bool active);
    event SignerUpdated(bytes32 indexed issuerId, address indexed signer, uint64 indexed authorizationId, bool active);
    event CredentialIssued(bytes32 indexed credentialId, bytes32 indexed issuerId, address indexed signer,
        bytes32 credentialDigest, uint64 signerAuthorizationId, uint64 issuedAt);
    event CredentialRevoked(bytes32 indexed credentialId, bytes32 indexed issuerId, uint64 revokedAt);
    event ComparisonRequested(bytes32 indexed requestId, bytes32 indexed credentialId,
        bytes32 uploadCommitment, address indexed resultReader);

    constructor(address admin, address attestor, address relayer, address reader) EIP712("VerifikasiIjazah", "1") {
        if (admin == address(0) || attestor == address(0) || relayer == address(0) || reader == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ATTESTOR_ROLE, attestor);
        _grantRole(RELAYER_ROLE, relayer);
        _grantRole(RESULT_READER_ROLE, reader);
    }

    function setIssuer(bytes32 issuerId, string calldata name, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (issuerId == bytes32(0) || bytes(name).length == 0 || bytes(name).length > 200) revert InvalidAddress();
        issuers[issuerId] = Issuer(name, active, true);
        emit IssuerUpdated(issuerId, name, active);
    }

    /// @notice Disabling or replacing a signer retains its complete authorization period.
    function setSigner(bytes32 issuerId, address wallet, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!issuers[issuerId].exists || wallet == address(0)) revert InvalidAddress();
        uint64 previousId = signerAuthorizationIds[wallet];
        SignerAuthorization storage previous = signerAuthorizations[previousId];
        if (previousId != 0 && previous.revokedAt == 0) {
            if (previous.issuerId != issuerId) revert UnauthorizedIssuer();
            if (active) return;
            previous.revokedAt = uint64(block.timestamp);
        } else if (!active) {
            if (previousId == 0 || previous.issuerId != issuerId) revert UnauthorizedIssuer();
            return;
        }
        if (active) {
            uint64 authorizationId = ++signerAuthorizationCount;
            signerAuthorizations[authorizationId] = SignerAuthorization(issuerId, wallet, uint64(block.timestamp), 0);
            signerAuthorizationIds[wallet] = authorizationId;
            emit SignerUpdated(issuerId, wallet, authorizationId, true);
        } else {
            emit SignerUpdated(issuerId, wallet, previousId, false);
        }
    }

    function getSigner(address wallet) public view returns (bytes32 issuerId, bool active, uint64 authorizationId) {
        authorizationId = signerAuthorizationIds[wallet];
        SignerAuthorization storage authorization = signerAuthorizations[authorizationId];
        return (authorization.issuerId, authorizationId != 0 && authorization.revokedAt == 0, authorizationId);
    }

    function issueCredential(CredentialAuthorization calldata authorization, bytes calldata signature,
        externalEuint256[4] calldata inputs, bytes calldata inputProof) external {
        (bytes32 issuerId, bool authorized, uint64 signerAuthorizationId) = getSigner(msg.sender);
        if (!authorized || issuerId != authorization.issuerId || !issuers[issuerId].active) revert UnauthorizedIssuer();
        if (authorization.signer != msg.sender) revert InvalidCredentialAuthorization();
        if (authorization.credentialId == bytes32(0)) revert InvalidCredential();
        if (credentials[authorization.credentialId].signer != address(0)) revert CredentialAlreadyExists();
        if (block.timestamp > authorization.issuanceDeadline) revert ExpiredCredentialAuthorization();
        if (issuanceNonceUsed[msg.sender][authorization.nonce]) revert ReplayedNonce();
        if (authorization.schemaVersion != 1 || authorization.encodingVersion != 1 ||
            authorization.disclosurePolicyVersion != 1) revert InvalidVersion();
        if (authorization.publicDataHash == bytes32(0) ||
            keccak256(abi.encode(authorization.encodingVersion, inputs)) != authorization.encryptedAttributesHash)
            revert InvalidCredentialAuthorization();
        bytes32 digest = hashCredentialAuthorization(authorization);
        if (ECDSA.recover(digest, signature) != msg.sender) revert InvalidCredentialAuthorization();

        issuanceNonceUsed[msg.sender][authorization.nonce] = true;
        Credential storage credential = credentials[authorization.credentialId];
        credential.issuerId = issuerId;
        credential.signer = msg.sender;
        credential.issuedAt = uint64(block.timestamp);
        credential.issuedBlock = uint64(block.number);
        credential.signerAuthorizationId = signerAuthorizationId;
        credential.schemaVersion = authorization.schemaVersion;
        credential.encodingVersion = authorization.encodingVersion;
        credential.disclosurePolicyVersion = authorization.disclosurePolicyVersion;
        credential.credentialDigest = digest;
        credential.publicDataHash = authorization.publicDataHash;
        credential.encryptedAttributesHash = authorization.encryptedAttributesHash;
        credential.issuerNameHash = keccak256(bytes(issuers[issuerId].name));
        issuerCredentials[issuerId].push(authorization.credentialId);
        for (uint256 i; i < 4; ++i) {
            euint256 referenceValue = FHE.fromExternal(inputs[i], inputProof);
            credential.attributes[i] = referenceValue;
            // Only this contract may use a reference (S-05). No account, including the issuing
            // signer, receives a persistent decrypt permission that a later rotation could not revoke.
            FHE.allowThis(referenceValue);
        }
        emit CredentialIssued(authorization.credentialId, issuerId, msg.sender, digest, signerAuthorizationId, credential.issuedAt);
    }

    /// @dev The institution's current authorized signer can revoke after institution deactivation.
    function revoke(bytes32 credentialId) external {
        Credential storage credential = credentials[credentialId];
        if (credential.signer == address(0)) revert InvalidCredential();
        (bytes32 issuerId, bool authorized,) = getSigner(msg.sender);
        if (!authorized || issuerId != credential.issuerId) revert UnauthorizedIssuer();
        if (credential.revokedAt != 0) revert CredentialInactive();
        credential.revokedAt = uint64(block.timestamp);
        credential.revokedBlock = uint64(block.number);
        emit CredentialRevoked(credentialId, issuerId, credential.revokedAt);
    }

    function getCredential(bytes32 credentialId) external view returns (Credential memory) {
        return credentials[credentialId];
    }

    function getIssuerCredentials(bytes32 issuerId, uint256 offset, uint256 limit)
        external view returns (bytes32[] memory ids, uint256 total) {
        total = issuerCredentials[issuerId].length;
        if (limit > 100) limit = 100;
        if (offset >= total) return (new bytes32[](0), total);
        uint256 count = total - offset;
        if (count > limit) count = limit;
        ids = new bytes32[](count);
        for (uint256 i; i < count; ++i) ids[i] = issuerCredentials[issuerId][offset + i];
    }

    function getComparison(bytes32 requestId) external view returns (Comparison memory) {
        return comparisons[requestId];
    }

    function verify(Verification calldata attestation, externalEuint256[4] calldata inputs,
        bytes calldata inputProof, bytes calldata signature) external onlyRole(RELAYER_ROLE) {
        if (attestation.relayer != msg.sender || !hasRole(RESULT_READER_ROLE, attestation.resultReader)) revert InvalidAttestation();
        if (block.timestamp > attestation.deadline) revert ExpiredAttestation();
        if (attestation.requestId == bytes32(0) || attestation.uploadCommitment == bytes32(0)) revert InvalidAttestation();
        if (requestUsed[attestation.requestId]) revert ReplayedRequest();
        if (keccak256(bytes(attestation.schemaVersion)) != keccak256(bytes(SCHEMA_VERSION)) ||
            keccak256(bytes(attestation.encodingVersion)) != keccak256(bytes(ENCODING_VERSION)) ||
            keccak256(bytes(attestation.normalizerVersion)) != keccak256(bytes(NORMALIZER_VERSION))) revert InvalidVersion();
        if (keccak256(abi.encode(inputs)) != attestation.inputHandlesHash) revert InvalidAttestation();
        address attestor = ECDSA.recover(_hashTypedDataV4(_attestationHash(attestation)), signature);
        if (!hasRole(ATTESTOR_ROLE, attestor)) revert InvalidAttestation();
        if (nonceUsed[attestor][attestation.nonce]) revert ReplayedNonce();
        Credential storage credential = credentials[attestation.credentialId];
        if (credential.signer == address(0)) revert InvalidCredential();
        if (credential.revokedAt != 0 || !issuers[credential.issuerId].active) revert CredentialInactive();
        requestUsed[attestation.requestId] = true;
        nonceUsed[attestor][attestation.nonce] = true;
        Comparison storage result = comparisons[attestation.requestId];
        result.credentialId = attestation.credentialId;
        result.uploadCommitment = attestation.uploadCommitment;
        result.resultReader = attestation.resultReader;
        result.comparedAt = uint64(block.timestamp);
        ebool allMatch;
        for (uint256 i; i < 4; ++i) {
            euint256 observed = FHE.fromExternal(inputs[i], inputProof);
            ebool matches = FHE.eq(credential.attributes[i], observed);
            result.fields[i] = matches;
            FHE.allowThis(matches);
            FHE.allow(matches, attestation.resultReader);
            allMatch = i == 0 ? matches : FHE.and(allMatch, matches);
        }
        result.allMatch = allMatch;
        FHE.allowThis(allMatch);
        FHE.allow(allMatch, attestation.resultReader);
        emit ComparisonRequested(attestation.requestId, attestation.credentialId,
            attestation.uploadCommitment, attestation.resultReader);
    }

    function _attestationHash(Verification calldata a) private pure returns (bytes32) {
        return keccak256(abi.encode(VERIFICATION_TYPEHASH, a.requestId, a.credentialId, a.uploadCommitment,
            keccak256(bytes(a.schemaVersion)), keccak256(bytes(a.encodingVersion)), keccak256(bytes(a.normalizerVersion)),
            a.ocrConfigHash, a.inputHandlesHash, a.relayer, a.resultReader, a.nonce, a.deadline));
    }

    function hashCredentialAuthorization(CredentialAuthorization calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CREDENTIAL_AUTHORIZATION_TYPEHASH, a.credentialId,
            a.issuerId, a.signer, a.publicDataHash, a.encryptedAttributesHash, a.schemaVersion,
            a.encodingVersion, a.disclosurePolicyVersion, a.nonce, a.issuanceDeadline)));
    }
}

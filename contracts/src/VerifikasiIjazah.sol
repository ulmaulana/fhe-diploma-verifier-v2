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
    /// @notice UTF-8 byte limit (not characters) for an institution name.
    uint256 public constant MAX_ISSUER_NAME_BYTES = 200;
    bytes32 public constant VERIFICATION_TYPEHASH = keccak256(
        "Verification(bytes32 requestId,bytes32 credentialId,bytes32 uploadCommitment,string schemaVersion,string encodingVersion,string normalizerVersion,bytes32 ocrConfigHash,bytes32 inputHandlesHash,address relayer,address resultReader,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant CREDENTIAL_AUTHORIZATION_TYPEHASH = keccak256(
        "CredentialAuthorization(bytes32 credentialId,bytes32 issuerId,address signer,bytes32 issuerNameHash,bytes32 publicDataHash,bytes32 encryptedAttributesHash,uint32 schemaVersion,uint32 encodingVersion,uint32 disclosurePolicyVersion,uint256 nonce,uint256 issuanceDeadline)"
    );

    struct Issuer { string name; bool active; bool exists; }
    struct SignerAuthorization { bytes32 issuerId; address signer; uint64 authorizedAt; uint64 revokedAt; }
    struct CredentialAuthorization {
        bytes32 credentialId;
        bytes32 issuerId;
        address signer;
        /// @dev keccak256 of the institution name the signer reviewed (S-04, protocol v2).
        bytes32 issuerNameHash;
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
    /// @notice Number of DEFAULT_ADMIN_ROLE holders; the last one cannot be revoked or renounced.
    uint256 public adminCount;

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
    error InvalidIssuer();
    error SignerAlreadyActive();
    error SignerNotActive();
    error RoleConflict(bytes32 role, address account);
    error InvalidRole(bytes32 role);
    error LastAdminRemoval();
    error CredentialIdMismatch();
    error IssuerNameChanged();
    event IssuerUpdated(bytes32 indexed issuerId, string name, bool active);
    event SignerUpdated(bytes32 indexed issuerId, address indexed signer, uint64 indexed authorizationId, bool active);
    event CredentialIssued(bytes32 indexed credentialId, bytes32 indexed issuerId, address indexed signer,
        bytes32 credentialDigest, uint64 signerAuthorizationId, uint64 issuedAt);
    event CredentialRevoked(bytes32 indexed credentialId, bytes32 indexed issuerId, uint64 revokedAt);
    event ComparisonRequested(bytes32 indexed requestId, bytes32 indexed credentialId,
        bytes32 uploadCommitment, address indexed resultReader);

    constructor(address admin, address attestor, address relayer, address reader) EIP712("VerifikasiIjazah", "2") {
        if (admin == address(0) || attestor == address(0) || relayer == address(0) || reader == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ATTESTOR_ROLE, attestor);
        _grantRole(RELAYER_ROLE, relayer);
        _grantRole(RESULT_READER_ROLE, reader);
    }

    function setIssuer(bytes32 issuerId, string calldata name, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (issuerId == bytes32(0) || bytes(name).length == 0 || bytes(name).length > MAX_ISSUER_NAME_BYTES) revert InvalidIssuer();
        issuers[issuerId] = Issuer(name, active, true);
        emit IssuerUpdated(issuerId, name, active);
    }

    /// @notice Disabling or replacing a signer retains its complete authorization period.
    /// @dev A call that would not change state reverts (S-10), so a confirmed transaction always
    /// corresponds to a SignerUpdated event.
    function setSigner(bytes32 issuerId, address wallet, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!issuers[issuerId].exists) revert InvalidIssuer();
        if (wallet == address(0)) revert InvalidAddress();
        uint64 previousId = signerAuthorizationIds[wallet];
        SignerAuthorization storage previous = signerAuthorizations[previousId];
        bool currentlyActive = previousId != 0 && previous.revokedAt == 0;
        if (currentlyActive && previous.issuerId != issuerId) revert UnauthorizedIssuer();
        if (active) {
            if (currentlyActive) revert SignerAlreadyActive();
            (bool held, bytes32 role) = _heldRole(wallet);
            if (held) revert RoleConflict(role, wallet);
            uint64 authorizationId = ++signerAuthorizationCount;
            signerAuthorizations[authorizationId] = SignerAuthorization(issuerId, wallet, uint64(block.timestamp), 0);
            signerAuthorizationIds[wallet] = authorizationId;
            emit SignerUpdated(issuerId, wallet, authorizationId, true);
        } else {
            if (!currentlyActive) revert SignerNotActive();
            previous.revokedAt = uint64(block.timestamp);
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
        if (_recover(digest, signature) != msg.sender) revert InvalidCredentialAuthorization();
        // S-03: an ID is derived from this contract, the institution, the signer and the signer's nonce,
        // so a signer of another institution cannot front-run and occupy an ID seen in the mempool.
        if (authorization.credentialId != credentialIdFor(issuerId, msg.sender, authorization.nonce)) revert CredentialIdMismatch();
        // S-04: the reviewed institution name is part of the e-signed payload. A rename between review and
        // inclusion reverts instead of storing a name that the signed public profile can never match.
        bytes32 issuerNameHash = keccak256(bytes(issuers[issuerId].name));
        if (authorization.issuerNameHash != issuerNameHash) revert IssuerNameChanged();

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
        credential.issuerNameHash = issuerNameHash;
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

    /// @notice The only credential ID that issueCredential accepts for this institution, signer and nonce.
    function credentialIdFor(bytes32 issuerId, address signer, uint256 nonce) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), issuerId, signer, nonce));
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
        address attestor = _recover(_hashTypedDataV4(_attestationHash(attestation)), signature);
        if (attestor == address(0) || !hasRole(ATTESTOR_ROLE, attestor)) revert InvalidAttestation();
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

    /// @dev Role separation (S-01): the administrator, attestor, relayer and result reader are four
    /// different accounts, and none of them may be an active institution signer. Checked on every grant,
    /// including the constructor, and in setSigner, so no path can combine authorities.
    function _grantRole(bytes32 role, address account) internal override returns (bool granted) {
        if (role != DEFAULT_ADMIN_ROLE && role != ATTESTOR_ROLE && role != RELAYER_ROLE && role != RESULT_READER_ROLE) {
            revert InvalidRole(role);
        }
        if (account == address(0)) revert InvalidAddress();
        if (!hasRole(role, account)) {
            (bool held, bytes32 other) = _heldRole(account);
            if (held) revert RoleConflict(other, account);
            if (_isActiveSigner(account)) revert RoleConflict(role, account);
        }
        granted = super._grantRole(role, account);
        if (granted && role == DEFAULT_ADMIN_ROLE) ++adminCount;
    }

    /// @dev Administrator continuity (S-02): a transfer must grant the new administrator first.
    function _revokeRole(bytes32 role, address account) internal override returns (bool revoked) {
        if (role == DEFAULT_ADMIN_ROLE && hasRole(role, account) && adminCount == 1) revert LastAdminRemoval();
        revoked = super._revokeRole(role, account);
        if (revoked && role == DEFAULT_ADMIN_ROLE) --adminCount;
    }

    function _heldRole(address account) private view returns (bool, bytes32) {
        bytes32[4] memory roles = [DEFAULT_ADMIN_ROLE, ATTESTOR_ROLE, RELAYER_ROLE, RESULT_READER_ROLE];
        for (uint256 i; i < 4; ++i) if (hasRole(roles[i], account)) return (true, roles[i]);
        return (false, bytes32(0));
    }

    function _isActiveSigner(address account) private view returns (bool) {
        uint64 authorizationId = signerAuthorizationIds[account];
        return authorizationId != 0 && signerAuthorizations[authorizationId].revokedAt == 0;
    }

    /// @dev Malformed, malleable (high-s) or unrecoverable signatures return address(0), which never
    /// matches an authorized signer or attestor, so callers revert with their own domain error (S-09).
    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecoverCalldata(digest, signature);
        return error == ECDSA.RecoverError.NoError ? recovered : address(0);
    }

    function _attestationHash(Verification calldata a) private pure returns (bytes32) {
        return keccak256(abi.encode(VERIFICATION_TYPEHASH, a.requestId, a.credentialId, a.uploadCommitment,
            keccak256(bytes(a.schemaVersion)), keccak256(bytes(a.encodingVersion)), keccak256(bytes(a.normalizerVersion)),
            a.ocrConfigHash, a.inputHandlesHash, a.relayer, a.resultReader, a.nonce, a.deadline));
    }

    function hashCredentialAuthorization(CredentialAuthorization calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CREDENTIAL_AUTHORIZATION_TYPEHASH, a.credentialId,
            a.issuerId, a.signer, a.issuerNameHash, a.publicDataHash, a.encryptedAttributesHash, a.schemaVersion,
            a.encodingVersion, a.disclosurePolicyVersion, a.nonce, a.issuanceDeadline)));
    }
}

import { accent, accentFill, accentSolid, createIcon, paper, soft, Sparks } from './Icon';

export type { IconProps } from './Icon';
export { DocumentMatchIllustration, RecordIllustration, ScanQrIllustration } from './illustrations';

// Navigation
export const HomeIcon = createIcon('HomeIcon', () => <><path style={soft} d="M5.5 10.2 12 4.8l6.5 5.4v8.6a1.7 1.7 0 0 1-1.7 1.7H7.2a1.7 1.7 0 0 1-1.7-1.7z"/><path d="M3.5 11.8 12 4.6l8.5 7.2"/><path style={accent} d="M10 20.5v-4a2 2 0 0 1 4 0v4"/></>);
export const VerifyRecordIcon = createIcon('VerifyRecordIcon', ({ detail }) => <><rect style={paper} x="2.5" y="4.5" width="15.5" height="12" rx="2"/><path d="M5.5 8.2h9M5.5 13.8h3.5"/><path style={accent} d="M5.5 11h5.5"/>{detail && <path style={accent} d="M4.5 18.9h7.2"/>}<path style={soft} d="M17.5 10.2l4 1.5v3.2c0 2.9-1.7 4.8-4 5.8-2.3-1-4-2.9-4-5.8v-3.2z"/><path style={accent} d="M15.8 15.1l1.2 1.2 2.4-2.6"/></>);
export const HistoryIcon = createIcon('HistoryIcon', ({ detail, sparks }) => <><circle style={paper} cx="12" cy="12" r="8.5"/>{detail && <path style={accent} d="M14.36 3.21a9.1 9.1 0 0 1 2.19 16.67"/>}<path d="M12 7.5V12l3 2"/>{sparks && <Sparks tone="warm"/>}</>);
export const BookIcon = createIcon('BookIcon', ({ detail }) => <><path style={paper} d="M12 6.8C10 5.4 7 5 3.5 5.3v12.4c3.5-.3 6.5.1 8.5 1.5 2-1.4 5-1.8 8.5-1.5V5.3C17 5 14 5.4 12 6.8z"/><path d="M12 6.8v12.4M6 9.2h3.5M6 12.2h3.5M14.5 12.2H18M14.5 15.2h2.3"/><path style={accent} d="M14.5 9.2H18M6 15.2h2.3"/>{detail && <path style={accent} d="M3.5 20.1c3.5-.3 6.5.1 8.5 1.3 2-1.2 5-1.6 8.5-1.3"/>}</>);
export const InstitutionIcon = createIcon('InstitutionIcon', ({ detail, sparks }) => <><path d="M12 6.6V2.3"/><path style={{ ...accentFill, ...accent }} d="M12 2.6h4.3l-1.2 1.35 1.2 1.35H12"/><path style={soft} d="M3.5 12.5h4v8h-4zM16.5 12.5h4v8h-4z"/><path style={soft} d="M7.5 10.2h9v10.3h-9z"/><path style={paper} d="M6.5 10.2 12 6.6l5.5 3.6z"/>{detail && <path d="M5.5 14.3v6.2M18.5 14.3v6.2"/>}<path style={accent} d="M10 12.8h4M10.7 20.5v-2.6a1.3 1.3 0 0 1 2.6 0v2.6"/><path d="M2.5 20.5h19"/>{sparks && <Sparks tone="warm"/>}</>);
export const MenuIcon = createIcon('MenuIcon', () => <path d="M4 7h16M4 12h16M4 17h16"/>);
// Sidebar edge tab: points left to collapse; the app shell turns it to point right while collapsed.
export const ChevronLeftIcon = createIcon('ChevronLeftIcon', () => <path d="M14.5 6 8.5 12l6 6"/>);
export const SearchIcon = createIcon('SearchIcon', ({ detail }) => <><circle style={soft} cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.8 4.8"/>{detail && <path style={accent} d="M7.9 9.3a3 3 0 0 1 2.2-2.2"/>}</>);
export const UserSessionIcon = createIcon('UserSessionIcon', () => <><circle style={paper} cx="10.5" cy="7.8" r="3.8"/><path d="M3.8 20.2c.4-3.9 3.2-6.7 6.7-6.7 1.3 0 2.5.3 3.5.9"/><circle style={accentSolid} cx="17.6" cy="17.6" r="3.9"/><path style={{ stroke: 'var(--icon-paper, #fff)' }} d="M17.6 15.9v3.4M15.9 17.6h3.4"/></>);

// Actions
export const ArrowRightIcon = createIcon('ArrowRightIcon', () => <path d="M4.5 12H19M13.5 6.5 19 12l-5.5 5.5"/>);
export const ChevronDownIcon = createIcon('ChevronDownIcon', () => <path d="M6 9.5l6 6 6-6"/>);
export const CloseIcon = createIcon('CloseIcon', () => <path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>);
export const CopyIcon = createIcon('CopyIcon', () => <><rect style={soft} x="8.5" y="8.5" width="12" height="12" rx="2.2"/><path d="M15.5 8.5V5.7a2.2 2.2 0 0 0-2.2-2.2H5.7a2.2 2.2 0 0 0-2.2 2.2v7.6a2.2 2.2 0 0 0 2.2 2.2h2.8"/></>);
const tray = 'M4 14.5v3.3A2.2 2.2 0 0 0 6.2 20h11.6a2.2 2.2 0 0 0 2.2-2.2v-3.3';
export const DownloadIcon = createIcon('DownloadIcon', ({ detail, sparks }) => <><path style={soft} d={tray}/>{detail && <path style={accent} d="M7 17.4h10"/>}<path style={accent} d="M12 3.5v6.5"/><path style={{ ...accentFill, ...accent }} d="M8 9.4h8l-4 4.4z"/>{sparks && <Sparks tone="warm"/>}</>);
export const UploadIcon = createIcon('UploadIcon', ({ detail }) => <><path style={soft} d={tray}/>{detail && <path style={accent} d="M7 17.4h10"/>}<path style={accent} d="M12 14V7.8"/><path style={{ ...accentFill, ...accent }} d="M8 8.4h8L12 4z"/></>);
export const RetryIcon = createIcon('RetryIcon', () => <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.7"/><path style={accent} d="M4 4v4.7h4.7"/></>);
export const TrashIcon = createIcon('TrashIcon', () => <><path style={soft} d="M6 7l.9 11.6a2 2 0 0 0 2 1.9h6.2a2 2 0 0 0 2-1.9L18 7"/><path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path style={accent} d="M10 11v5.5M14 11v5.5"/></>);
export const ExternalLinkIcon = createIcon('ExternalLinkIcon', () => <><path d="M18.5 13.5v4.3a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 17.8V7.7a2.2 2.2 0 0 1 2.2-2.2h4.3"/><path style={accent} d="M14 3.5h6.5V10M20.5 3.5l-9 9"/></>);

// Documents
const filePath = 'M14 3.5H7.7a2.2 2.2 0 0 0-2.2 2.2v12.6a2.2 2.2 0 0 0 2.2 2.2h8.6a2.2 2.2 0 0 0 2.2-2.2V8z';
const fileFold = 'M14 3.5V7a1 1 0 0 0 1 1h3.5z';
export const FileIcon = createIcon('FileIcon', () => <><path style={soft} d={filePath}/><path style={accentFill} d={fileFold}/><path d="M9 12.5h6M9 15.8h6"/></>);
export const FileUpIcon = createIcon('FileUpIcon', () => <><path style={soft} d={filePath}/><path style={accentFill} d={fileFold}/><path style={accent} d="M12 17.5v-5.3M9.6 14.6l2.4-2.4 2.4 2.4"/></>);
export const ReadDocumentIcon = createIcon('ReadDocumentIcon', ({ detail }) => <>{detail && <path style={accent} d="M3.4 7.5c-.5 3.6-.5 7.4 0 11M20.6 7.5c.5 3.6.5 7.4 0 11"/>}<rect style={paper} x="5.5" y="4.5" width="13" height="16.5" rx="2.4"/><rect style={soft} x="9" y="2.8" width="6" height="3.4" rx="1.1"/><path d="M9 11.3h6M9 15h6"/></>);
export const MatchDocumentIcon = createIcon('MatchDocumentIcon', ({ detail }) => <>{detail && <path style={accent} d="M1.8 8.5v8.5"/>}<path style={paper} d="M14.5 10.5V7.5L11 4H6.2A2.2 2.2 0 0 0 4 6.2v12.1a2.2 2.2 0 0 0 2.2 2.2H10"/><path d="M10.8 4v2.8a.8.8 0 0 0 .8.8h2.9M7 9.5h2M7 12.5h3.5M7 15.5h1.8"/><circle style={{ ...soft, ...accent }} cx="15.3" cy="15.3" r="3.7"/><path style={accent} d="M18 18l3 3"/></>);
export const MatchAttributeIcon = createIcon('MatchAttributeIcon', ({ detail }) => <><path d="M3.5 8h17M3.5 16h17"/><circle style={accentFill} cx="9" cy="8" r="2.5"/><circle style={accentFill} cx="15" cy="16" r="2.5"/>{detail && <><circle style={{ ...soft, stroke: 'none' }} cx="8.4" cy="7.4" r=".75"/><circle style={{ ...soft, stroke: 'none' }} cx="14.4" cy="15.4" r=".75"/></>}</>);

// Security and status
export const ShieldCheckIcon = createIcon('ShieldCheckIcon', () => <><path style={soft} d="M12 2.8l7.5 2.8v5.7c0 4.6-3.1 7.9-7.5 9.9-4.4-2-7.5-5.3-7.5-9.9V5.6z"/><path style={accent} d="M8.6 12.1l2.4 2.4 4.5-4.6"/></>);
export const LockIcon = createIcon('LockIcon', ({ detail }) => <><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/><rect style={soft} x="5" y="10.5" width="14" height="10" rx="2.6"/><circle style={accentSolid} cx="12" cy="14.7" r="1.3"/><path style={accent} d="M12 15.4v2"/>{detail && <path style={accent} d="M16.4 16.3v1.6"/>}</>);
export const EncryptionIcon = createIcon('EncryptionIcon', () => <><path d="M9.8 11V9a2.2 2.2 0 0 1 4.4 0v2"/><rect style={soft} x="7.6" y="11" width="8.8" height="7.5" rx="1.8"/><circle fill="currentColor" stroke="none" cx="12" cy="14.3" r=".95"/><path d="M12 14.8v1.5"/><g style={accent}><path d="M7.6 14.8H5.3L3.9 13M7.6 17.2l-2.2 2.1M16.4 12.8l2.2-2.2M16.4 16.6l2.5 1.4"/><circle cx="3.2" cy="12.1" r="1.15"/><circle cx="4.5" cy="20.2" r="1.15"/><circle cx="19.4" cy="9.8" r="1.15"/><circle cx="20" cy="18.6" r="1.15"/></g></>);
export const WalletIcon = createIcon('WalletIcon', () => <><path d="M5.5 6.5l9.7-2.8a1 1 0 0 1 1.3 1v1.8"/><rect style={soft} x="3" y="6.5" width="18" height="13.5" rx="2.5"/><path style={paper} d="M21 10.8h-4.3a2.45 2.45 0 0 0 0 4.9H21z"/><circle style={accentSolid} cx="16.8" cy="13.25" r=".95"/></>);
export const CheckIcon = createIcon('CheckIcon', () => <path d="M5 12.5l4.3 4.3L19 7.3"/>);
export const CheckCheckIcon = createIcon('CheckCheckIcon', () => <path d="M2.5 12.3l4.5 4.5L17 6.8M13.2 16l.8.8 8-8"/>);
export const AlertIcon = createIcon('AlertIcon', () => <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.6v5.2"/><circle fill="currentColor" stroke="none" cx="12" cy="16.3" r="1.05"/></>);
export const InfoIcon = createIcon('InfoIcon', () => <><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.3"/><circle style={accentSolid} cx="12" cy="7.9" r="1.1"/></>);
export const SpinnerIcon = createIcon('SpinnerIcon', () => <><circle style={{ stroke: 'var(--icon-soft, #e2f3ff)' }} cx="12" cy="12" r="8.5"/><path style={accent} d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/></>);

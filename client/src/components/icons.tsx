import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            {...rest}
        >
            {children}
        </svg>
    );
}

export function MenuIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M4 6h16M4 12h16M4 18h16" />
        </Icon>
    );
}

export function LockIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </Icon>
    );
}

export function RefreshIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
            <path d="M3 21v-5h5" />
            <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
            <path d="M21 3v5h-5" />
        </Icon>
    );
}

export function SunIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </Icon>
    );
}

export function MoonIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </Icon>
    );
}

export function EyeIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
        </Icon>
    );
}

export function EyeOffIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
            <path d="M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </Icon>
    );
}

export function ChevronLeftIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="m15 18-6-6 6-6" />
        </Icon>
    );
}

export function ChevronRightIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="m9 18 6-6-6-6" />
        </Icon>
    );
}

export function InfoIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
        </Icon>
    );
}

export function WalletIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3" />
            <path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
            <path d="M21 12h-4a2 2 0 0 0 0 4h4z" />
        </Icon>
    );
}

export function IncomeIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
        </Icon>
    );
}

export function TrendUpIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="m3 17 6-6 4 4 8-8" />
            <path d="M14 7h7v7" />
        </Icon>
    );
}

export function PlusIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M12 5v14M5 12h14" />
        </Icon>
    );
}

export function ClockIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </Icon>
    );
}

export function CloseIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M6 6l12 12M18 6 6 18" />
        </Icon>
    );
}

export function ActivityIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </Icon>
    );
}

export function CarIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M19 17h2v-4l-2.5-5h-13L3 13v4h2" />
            <circle cx="7" cy="17" r="2" />
            <circle cx="17" cy="17" r="2" />
            <path d="M9 17h6M3 13h18" />
        </Icon>
    );
}

export function ReceiptIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
            <path d="M9 8h6M9 12h6M9 16h3" />
        </Icon>
    );
}

export function PieIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M21 13A9 9 0 1 1 11 3v10z" />
            <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
        </Icon>
    );
}

export function RepeatIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </Icon>
    );
}

export function CoinsIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <circle cx="9" cy="9" r="6" />
            <path d="M18.1 10.4a6 6 0 1 1-7.7 7.7" />
            <path d="M9 6.5v5M7.5 8h2.5" />
        </Icon>
    );
}

export function PercentIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M19 5 5 19" />
            <circle cx="6.5" cy="6.5" r="2.5" />
            <circle cx="17.5" cy="17.5" r="2.5" />
        </Icon>
    );
}

export function UtensilsIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18" />
            <path d="M18 21V3c-2 0-4 2-4 6v4h4" />
        </Icon>
    );
}

export function CardIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20M6 15h4" />
        </Icon>
    );
}

export function PlaneIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </Icon>
    );
}

export function BankIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10" />
            <path d="M12 3 3 8h18z" />
        </Icon>
    );
}

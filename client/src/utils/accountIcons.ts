export interface AccountIconDef {
    key: string;
    label: string;
    short: string;
    bg: string;
    fg: string;
    /** Official website domain used to look up the real bank/brand logo. */
    domain?: string;
}

const ACCOUNT_ICONS: AccountIconDef[] = [
    { key: 'maybank', label: 'Maybank', short: 'MB', bg: '#FFD100', fg: '#1a1a1a', domain: 'maybank2u.com.my' },
    { key: 'cimb', label: 'CIMB', short: 'CIMB', bg: '#ED1C24', fg: '#fff', domain: 'cimb.com.my' },
    { key: 'public-bank', label: 'Public Bank', short: 'PB', bg: '#003DA5', fg: '#fff', domain: 'pbebank.com' },
    { key: 'uob', label: 'UOB', short: 'UOB', bg: '#0B1F6A', fg: '#fff', domain: 'uob.com.my' },
    { key: 'hong-leong', label: 'Hong Leong', short: 'HLB', bg: '#00A651', fg: '#fff', domain: 'hlb.com.my' },
    { key: 'rhb', label: 'RHB', short: 'RHB', bg: '#0066B3', fg: '#fff', domain: 'rhbgroup.com' },
    { key: 'ambank', label: 'AmBank', short: 'AM', bg: '#E31837', fg: '#fff', domain: 'ambank.com.my' },
    { key: 'hsbc', label: 'HSBC', short: 'HSBC', bg: '#DB0011', fg: '#fff', domain: 'hsbc.com.my' },
    { key: 'ocbc', label: 'OCBC', short: 'OCBC', bg: '#EE1C25', fg: '#fff', domain: 'ocbc.com.my' },
    { key: 'alliance', label: 'Alliance', short: 'AB', bg: '#0055A5', fg: '#fff', domain: 'alliancebank.com.my' },
    { key: 'standard-chartered', label: 'StanChart', short: 'SC', bg: '#0072AA', fg: '#fff', domain: 'sc.com' },
    { key: 'tng', label: 'Touch n Go', short: 'TnG', bg: '#0057B8', fg: '#fff', domain: 'tngdigital.com.my' },
    { key: 'grabpay', label: 'GrabPay', short: 'GP', bg: '#00B14F', fg: '#fff', domain: 'grab.com' },
    { key: 'shopeepay', label: 'ShopeePay', short: 'SP', bg: '#EE4D2D', fg: '#fff', domain: 'shopeepay.com.my' },
    { key: 'rakuten', label: 'Rakuten', short: 'RK', bg: '#BF0000', fg: '#fff', domain: 'rakutentrade.my' },
    { key: 'gx-bank', label: 'GX Bank', short: 'GX', bg: '#7C3AED', fg: '#fff', domain: 'gxbank.my' },
    { key: 'stashaway', label: 'StashAway', short: 'SA', bg: '#0B1E3D', fg: '#fff', domain: 'stashaway.my' },
    { key: 'funding-societies', label: 'Funding Societies', short: 'FS', bg: '#5B4FC7', fg: '#fff', domain: 'fundingsocieties.com.my' },
    { key: 'public-mutual', label: 'Public Mutual', short: 'PM', bg: '#8B1E3F', fg: '#fff' },
    { key: 'cash', label: 'Cash', short: '$', bg: '#4B5563', fg: '#fff' },
    { key: 'credit', label: 'Credit card', short: 'CC', bg: '#0F766E', fg: '#fff' },
    { key: 'investment', label: 'Investment', short: 'INV', bg: '#1E3A5F', fg: '#fff' },
    { key: 'bank', label: 'Bank', short: 'BNK', bg: '#334155', fg: '#fff' },
];

const ICON_BY_KEY = new Map(ACCOUNT_ICONS.map((icon) => [icon.key, icon]));

const NAME_HINTS: { match: RegExp; key: string }[] = [
    { match: /\bmaybank\b|\bmb\b/i, key: 'maybank' },
    { match: /\bcimb\b/i, key: 'cimb' },
    { match: /\bpublic\s*bank\b|\bpbb\b/i, key: 'public-bank' },
    { match: /\buob\b/i, key: 'uob' },
    { match: /\bhong\s*leong\b|\bhlb\b/i, key: 'hong-leong' },
    { match: /\brhb\b/i, key: 'rhb' },
    { match: /\bambank\b|\bam\s*bank\b/i, key: 'ambank' },
    { match: /\bhsbc\b/i, key: 'hsbc' },
    { match: /\bocbc\b/i, key: 'ocbc' },
    { match: /\balliance\b/i, key: 'alliance' },
    { match: /\bstandard\s*chartered\b|\bstanchart\b/i, key: 'standard-chartered' },
    { match: /\btng\b|\btouch\s*['’]?n\s*go\b|\btouch\s*n\s*go\b/i, key: 'tng' },
    { match: /\bgrab\s*pay\b|\bgrabpay\b/i, key: 'grabpay' },
    { match: /\bshopee\s*pay\b|\bshopeepay\b/i, key: 'shopeepay' },
    { match: /\brakuten\b|\brukuten\b/i, key: 'rakuten' },
    { match: /\bgx\s*bank\b|\bgx\s*fd\b/i, key: 'gx-bank' },
    { match: /\bstash\s*away\b/i, key: 'stashaway' },
    { match: /\bfunding\s*societies\b/i, key: 'funding-societies' },
    { match: /\bpublic\s*mutual\b/i, key: 'public-mutual' },
    { match: /\bcash\b/i, key: 'cash' },
    { match: /\bcredit\b|\bvisa\b|\bmastercard\b|\bamex\b/i, key: 'credit' },
    { match: /\bepf\b|\basnb\b|\bfund\b|\bstock\b|\binvest/i, key: 'investment' },
];

export function resolveAccountIcon(name: string, accountType?: string): AccountIconDef {
    const trimmed = name.trim();
    if (trimmed) {
        for (const hint of NAME_HINTS) {
            if (hint.match.test(trimmed)) {
                return ICON_BY_KEY.get(hint.key) ?? ICON_BY_KEY.get('bank')!;
            }
        }
    }
    if (accountType === 'credit') return ICON_BY_KEY.get('credit')!;
    if (accountType === 'investment') return ICON_BY_KEY.get('investment')!;
    return ICON_BY_KEY.get('bank')!;
}

import {
    BankIcon,
    BoltIcon,
    CarIcon,
    CoffeeIcon,
    HeartIcon,
    PlaneIcon,
    ReceiptIcon,
    ShieldIcon,
    ShoppingBagIcon,
    TagIcon,
    TicketIcon,
    TrendUpIcon,
    UtensilsIcon,
} from './icons';

type Tone = 'orange' | 'amber' | 'purple' | 'pink' | 'blue' | 'teal' | 'green' | 'fuchsia' | 'neutral';

// Categories are free text, so match on words: a new "Groceries" or "Petrol" budget gets a fitting icon too.
// First match wins, so Bank charges is caught before anything else sees "bank".
const RULES: { match: RegExp; Icon: typeof TagIcon; tone: Tone }[] = [
    { match: /bank|\bfees?\b|\bcharges?\b/, Icon: ReceiptIcon, tone: 'neutral' },
    { match: /food|meal|groc|restaurant|dining|\beat\b|lunch|dinner|breakfast/, Icon: UtensilsIcon, tone: 'orange' },
    { match: /drink|coffee|caf[eé]|\btea\b|boba|beverage/, Icon: CoffeeIcon, tone: 'amber' },
    { match: /entertain|movie|cinema|theat|game|hobby|stream|music|\bfun\b/, Icon: TicketIcon, tone: 'purple' },
    { match: /shop|cloth|apparel|fashion/, Icon: ShoppingBagIcon, tone: 'pink' },
    { match: /travel|trip|holiday|vacation|flight|hotel/, Icon: PlaneIcon, tone: 'teal' },
    { match: /transport|petrol|fuel|parking|toll|grab|taxi|\bcar\b|commute|train|\bbus\b/, Icon: CarIcon, tone: 'blue' },
    { match: /utilit|electric|water|internet|phone|mobile|bill/, Icon: BoltIcon, tone: 'amber' },
    { match: /health|medic|doctor|clinic|pharm|dental/, Icon: HeartIcon, tone: 'pink' },
    { match: /insur/, Icon: ShieldIcon, tone: 'blue' },
    { match: /invest|saving|stock|crypto/, Icon: TrendUpIcon, tone: 'green' },
    { match: /loan|debt|mortgage/, Icon: BankIcon, tone: 'fuchsia' },
];

interface Props {
    category: string;
    /** sm for list rows, md for cards. */
    size?: 'sm' | 'md';
    className?: string;
}

/** A tinted badge for an expense category: a fork and knife for Food, a car for Transport, a tag otherwise. */
export default function CategoryIcon({ category, size = 'md', className = '' }: Props) {
    const name = category.trim().toLowerCase();
    const { Icon, tone } = RULES.find((rule) => rule.match.test(name)) ?? { Icon: TagIcon, tone: 'neutral' };
    return (
        <span
            className={`category-icon category-icon--${size} category-icon--${tone}${className ? ` ${className}` : ''}`}
            aria-hidden
        >
            <Icon size={size === 'sm' ? 16 : 18} />
        </span>
    );
}

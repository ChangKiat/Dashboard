import { TAB_LABELS, type TabId } from '../hooks/useSectionTab';

interface Props {
    active: TabId;
    onChange: (tab: TabId) => void;
}

const TABS: TabId[] = ['expenses', 'health'];

export default function SectionTabs({ active, onChange }: Props) {
    return (
        <div className="section-tabs" role="tablist" aria-label="Dashboard sections">
            {TABS.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    role="tab"
                    className={active === tab ? 'section-tab active' : 'section-tab'}
                    aria-selected={active === tab}
                    onClick={() => onChange(tab)}
                >
                    {TAB_LABELS[tab]}
                </button>
            ))}
        </div>
    );
}

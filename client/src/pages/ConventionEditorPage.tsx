import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api.js';
import type { ConventionCardData } from '@goatbridge/shared';
import { DEFAULT_CONVENTION_CARD } from '@goatbridge/shared';

export default function ConventionEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [sections, setSections] = useState<ConventionCardData>(DEFAULT_CONVENTION_CARD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<{ name: string; sections: ConventionCardData }>(`/conventions/${id}`).then(r => {
      setName(r.data.name);
      setSections(r.data.sections);
    }).finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    setSaving(true);
    await api.put(`/conventions/${id}`, { name, sections });
    setSaving(false);
    navigate('/conventions');
  };

  const update = (key: keyof ConventionCardData, value: unknown) => {
    setSections(prev => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="p-6 text-cream/50">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/conventions')} className="text-cream/50 hover:text-cream">← Back</button>
        <h1 className="text-2xl font-bold text-gold flex-1">Edit Convention Card</h1>
        <button
          onClick={save}
          disabled={saving}
          className="bg-gold hover:bg-gold-light text-navy font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="bg-navy border border-gold/30 rounded-xl p-6 space-y-6">
        <div>
          <label className="block text-cream/80 text-sm mb-1">Card Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
          />
        </div>

        <div>
          <label className="block text-cream/80 text-sm mb-1">General Approach</label>
          <input
            value={sections.generalApproach}
            onChange={e => update('generalApproach', e.target.value)}
            className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
            placeholder="e.g. Standard American, 5-card majors"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-cream/80 text-sm mb-1">1NT Range (Lo)</label>
            <input
              type="number"
              value={sections.ntRange.lo}
              onChange={e => update('ntRange', { ...sections.ntRange, lo: parseInt(e.target.value) })}
              className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-cream/80 text-sm mb-1">1NT Range (Hi)</label>
            <input
              type="number"
              value={sections.ntRange.hi}
              onChange={e => update('ntRange', { ...sections.ntRange, hi: parseInt(e.target.value) })}
              className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
            />
          </div>
        </div>

        {/* Boolean conventions */}
        <div>
          <div className="text-cream/80 text-sm mb-2">Conventions Used</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['stayman', 'Stayman'],
              ['transfers', 'Transfers'],
              ['twoClubStrong', '2♣ Strong'],
              ['weakTwos', 'Weak 2s'],
              ['blackwood', 'Blackwood'],
              ['gerber', 'Gerber'],
              ['negativeDoubles', 'Neg. Doubles'],
            ] as [keyof ConventionCardData, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-cream/70 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={sections[key] as boolean}
                  onChange={e => update(key, e.target.checked)}
                  className="accent-gold"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Text fields */}
        {([
          ['majorSystem', 'Major System'],
          ['minorSystem', 'Minor System'],
          ['defensiveSignals', 'Defensive Signals'],
          ['leadConventions', 'Opening Leads'],
          ['otherNotes', 'Other Notes'],
        ] as [keyof ConventionCardData, string][]).map(([key, label]) => (
          <div key={key}>
            <label className="block text-cream/80 text-sm mb-1">{label}</label>
            <textarea
              value={sections[key] as string}
              onChange={e => update(key, e.target.value)}
              rows={2}
              className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold resize-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

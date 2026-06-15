'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  HAZARD_LABELS,
  HAZARD_TYPES,
  NCR_BOUNDS,
  type AuthorityProfile,
  type HazardType,
  type Report,
} from '@/lib/types';
import { HazardMap } from './HazardMap';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';

interface DashboardProps {
  profile: AuthorityProfile;
  initialReports: Report[];
  userEmail: string;
}

const SEVERITY_DEFAULTS: Record<number, { hard: number; soft: number }> = {
  1: { hard: 150, soft: 350 },
  2: { hard: 250, soft: 500 },
  3: { hard: 400, soft: 700 },
};

function inNcr(lng: number, lat: number) {
  return (
    lng >= NCR_BOUNDS.sw[0] &&
    lng <= NCR_BOUNDS.ne[0] &&
    lat >= NCR_BOUNDS.sw[1] &&
    lat <= NCR_BOUNDS.ne[1]
  );
}

function severityClass(s: number) {
  return s === 3 ? 'badge badge-sev-3' : s === 2 ? 'badge badge-sev-2' : 'badge badge-sev-1';
}

export function Dashboard({ profile, initialReports, userEmail }: DashboardProps) {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<Report[]>(initialReports);

  const [pin, setPin] = useState<{ lng: number; lat: number } | null>(null);
  const [hazardType, setHazardType] = useState<HazardType>('flood');
  const [severity, setSeverity] = useState<1 | 2 | 3>(3);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { hard, soft } = SEVERITY_DEFAULTS[severity];
  const active = reports.filter((r) => !r.resolved_at);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pin) {
      setError('Click the map to set the hazard location first.');
      return;
    }
    if (!inNcr(pin.lng, pin.lat)) {
      setError('The pin is outside Metro Manila (NCR).');
      return;
    }
    if (!description.trim()) {
      setError('Add a short description.');
      return;
    }

    setSubmitting(true);
    const { data, error: insertError } = await supabase
      .from('reports')
      .insert({
        authority_id: profile.user_id,
        hazard_type: hazardType,
        description: description.trim(),
        severity,
        lng: pin.lng,
        lat: pin.lat,
        hard_radius_m: hard,
        soft_radius_m: soft,
      })
      .select()
      .single<Report>();
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setReports((r) => [data, ...r]);
    setDescription('');
  }

  async function resolve(id: string) {
    const prev = reports;
    setReports((r) =>
      r.map((x) => (x.id === id ? { ...x, resolved_at: new Date().toISOString() } : x)),
    );
    const { error: updErr } = await supabase
      .from('reports')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (updErr) {
      setReports(prev);
      setError(updErr.message);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar user={{ agency: profile.agency, name: profile.full_name ?? userEmail }} />

      <main className="container" style={{ flex: 1 }}>
        {/* Page heading */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div>
            <h1>Hazard reports</h1>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              Publish hazards for {profile.agency}. Residents are routed around them in real time.
            </p>
          </div>
          <div className="stat">
            <span className="stat-num">{active.length}</span>
            <span className="muted">active {active.length === 1 ? 'report' : 'reports'}</span>
          </div>
        </div>

        {/* Form + map */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 0.85fr) 1.4fr',
            gap: 24,
            alignItems: 'start',
          }}
        >
          <form className="card" onSubmit={submit}>
            <h2>File a report</h2>

            <div className="field">
              <label htmlFor="htype">Hazard type</label>
              <select
                id="htype"
                value={hazardType}
                onChange={(e) => setHazardType(e.target.value as HazardType)}
              >
                {HAZARD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {HAZARD_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="sev">Severity</label>
              <select
                id="sev"
                value={severity}
                onChange={(e) => setSeverity(Number(e.target.value) as 1 | 2 | 3)}
              >
                <option value={1}>1, Minor (passable, caution)</option>
                <option value={2}>2, Moderate</option>
                <option value={3}>3, Severe (impassable)</option>
              </select>
              <span className="hint">
                Block radius {hard} m, caution radius {soft} m
              </span>
            </div>

            <div className="field">
              <label htmlFor="desc">Description</label>
              <textarea
                id="desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Baha sa Espana Blvd, hindi madaanan."
              />
            </div>

            <div className="field">
              <label>Location</label>
              <span className="hint">
                {pin
                  ? `Pinned at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`
                  : 'Click the map to drop a pin.'}
              </span>
            </div>

            {error && <p className="error" style={{ marginBottom: 14 }}>{error}</p>}

            <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Publishing...' : 'Publish report'}
            </button>
          </form>

          <div
            className="card"
            style={{ height: 520, padding: 10, overflow: 'hidden' }}
          >
            <HazardMap
              pin={pin}
              hardRadiusM={hard}
              softRadiusM={soft}
              activeReports={active}
              onPick={(lng, lat) => setPin({ lng, lat })}
            />
          </div>
        </div>

        {/* Active reports */}
        <section style={{ marginTop: 40 }}>
          <h2>Active reports</h2>
          {active.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48 }}>
              <p style={{ fontWeight: 600, margin: 0 }}>No active hazards</p>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                Metro Manila is clear. New reports will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {active.map((r) => (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 20,
                    padding: 20,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <strong style={{ fontSize: 16 }}>{HAZARD_LABELS[r.hazard_type]}</strong>
                      <span className={severityClass(r.severity)}>Severity {r.severity}</span>
                    </div>
                    <div style={{ color: 'var(--body)' }}>{r.description}</div>
                    <div className="hint" style={{ marginTop: 6 }}>
                      {r.lat.toFixed(4)}, {r.lng.toFixed(4)} &middot;{' '}
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                  <button className="btn-outline" onClick={() => resolve(r.id)}>
                    Mark resolved
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

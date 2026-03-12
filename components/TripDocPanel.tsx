'use client'

import { useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'

type DocPanelProps = {
  tripId: string
  vehicleNumber?: string
  driveFolderUrl?: string | null
  royaltyPass?: { image_url: string; extracted?: Record<string, unknown> | null } | null
  wb1Slip?: { image_url: string; net_weight?: number | null } | null
  wb2Slip?: { image_url: string; net_weight?: number | null } | null
  supabase: SupabaseClient
  traderId?: string // only trader can edit drive URL
  onClose: () => void
}

export default function TripDocPanel({
  tripId, vehicleNumber, driveFolderUrl, royaltyPass, wb1Slip, wb2Slip,
  supabase, traderId, onClose,
}: DocPanelProps) {
  const [driveUrl, setDriveUrl] = useState(driveFolderUrl ?? '')
  const [editingDrive, setEditingDrive] = useState(false)
  const [savingDrive, setSavingDrive]   = useState(false)
  const [expanded, setExpanded]         = useState<string | null>(null)

  async function saveDriveUrl() {
    setSavingDrive(true)
    await supabase.from('trips').update({ drive_folder_url: driveUrl || null }).eq('id', tripId)
    setSavingDrive(false)
    setEditingDrive(false)
  }

  const docs = [
    { key: 'royalty', label: 'Royalty Pass',    url: royaltyPass?.image_url,  info: royaltyPass?.extracted },
    { key: 'wb1',     label: 'WB1 — Source',    url: wb1Slip?.image_url,      info: wb1Slip?.net_weight != null ? { 'Net Weight': `${wb1Slip.net_weight} MT` } : null },
    { key: 'wb2',     label: 'WB2 — Delivery',  url: wb2Slip?.image_url,      info: wb2Slip?.net_weight != null ? { 'Net Weight': `${wb2Slip.net_weight} MT` } : null },
  ]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose} />

      {/* Panel — slides up from bottom on mobile, fixed width on desktop */}
      <div className="fixed bottom-0 left-0 right-0 sm:right-auto sm:left-auto sm:top-0 sm:bottom-0 sm:w-96 sm:right-0 z-50 bg-sx-card border-t sm:border-t-0 sm:border-l border-sx-border rounded-t-2xl sm:rounded-none overflow-y-auto"
        style={{ maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-sx-border sticky top-0 bg-sx-card z-10">
          <div>
            <p className="font-semibold text-sx-hi">Trip Documents</p>
            {vehicleNumber && <p className="text-xs text-sx-lo font-mono mt-0.5">{vehicleNumber}</p>}
          </div>
          <button onClick={onClose} className="text-sx-lo hover:text-sx-hi text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drive Folder */}
          <div className="bg-sx-raised border border-sx-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-sx-lo uppercase tracking-wide">Google Drive Folder</p>
              {traderId && !editingDrive && (
                <button onClick={() => setEditingDrive(true)} className="text-xs text-sx-accent hover:opacity-80">
                  {driveUrl ? 'Edit' : 'Add Link'}
                </button>
              )}
            </div>
            {editingDrive ? (
              <div className="space-y-2">
                <input
                  type="url"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={driveUrl}
                  onChange={e => setDriveUrl(e.target.value)}
                  className="w-full bg-sx-base border border-sx-border rounded-lg px-3 py-2 text-sm text-sx-hi placeholder-sx-lo focus:outline-none focus:ring-2 focus:ring-sx-accent"
                />
                <div className="flex gap-2">
                  <button onClick={saveDriveUrl} disabled={savingDrive}
                    className="flex-1 bg-sx-accent text-white rounded-lg py-2 text-xs font-semibold disabled:opacity-40">
                    {savingDrive ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setEditingDrive(false)}
                    className="flex-1 border border-sx-border text-sx-lo rounded-lg py-2 text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            ) : driveUrl ? (
              <a href={driveUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sx-blue text-sm hover:opacity-80">
                <span>📁</span>
                <span className="underline truncate">Open Drive Folder</span>
              </a>
            ) : (
              <p className="text-xs text-sx-lo">No Drive folder linked</p>
            )}
          </div>

          {/* Documents */}
          {docs.map(doc => (
            <div key={doc.key} className="bg-sx-raised border border-sx-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  {doc.url ? (
                    <span className="text-sx-green text-sm">✓</span>
                  ) : (
                    <span className="text-sx-lo text-sm">○</span>
                  )}
                  <p className="text-sm font-medium text-sx-hi">{doc.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  {doc.url && (
                    <>
                      <a href={doc.url} target="_blank" rel="noreferrer"
                        className="text-xs text-sx-blue hover:opacity-80">View</a>
                      {doc.info && (
                        <button onClick={() => setExpanded(expanded === doc.key ? null : doc.key)}
                          className="text-xs text-sx-lo hover:text-sx-hi">
                          {expanded === doc.key ? 'Hide' : 'Details'}
                        </button>
                      )}
                    </>
                  )}
                  {!doc.url && <span className="text-xs text-sx-lo">Not uploaded</span>}
                </div>
              </div>
              {/* Expanded details */}
              {expanded === doc.key && doc.info && (
                <div className="px-4 pb-4 space-y-1 border-t border-sx-border pt-3">
                  {typeof doc.info === 'object' && Object.entries(doc.info)
                    .filter(([, v]) => v != null && v !== '')
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-sx-lo capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="text-sx-hi font-medium">{String(v)}</span>
                      </div>
                    ))}
                </div>
              )}
              {/* Image preview if expanded */}
              {expanded === doc.key && doc.url && (
                <div className="px-4 pb-4">
                  <img src={doc.url} alt={doc.label}
                    className="w-full rounded-lg object-contain max-h-48 bg-sx-base" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

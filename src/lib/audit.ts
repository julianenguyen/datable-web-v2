import { supabase } from '@/lib/supabase'

export type PhiRecordType =
  | 'daily_log'
  | 'presession_reflection'
  | 'healthkit_snapshot'
  | 'presession_brief'
  | 'checkin_response'
  | 'client_profile'
  | 'session_summary'

export type AuditAction = 'read' | 'write' | 'delete'

/**
 * Log a PHI access event to the audit log.
 * Call this any time therapist-facing code reads or writes PHI.
 * Fires-and-forgets — does not block the calling function.
 */
export function logPhiAccess(
  clientId: string,
  recordType: PhiRecordType,
  action: AuditAction = 'read',
  recordId?: string,
): void {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return
    supabase.from('phi_access_log').insert({
      therapist_id: user.id,
      client_id: clientId,
      record_type: recordType,
      record_id: recordId ?? null,
      action,
    }).then(({ error }) => {
      if (error) console.error('[HIPAA audit]', error.message)
    })
  })
}

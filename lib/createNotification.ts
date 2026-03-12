import { createClient } from '@/lib/supabase/server'

export async function createNotification({
  userId,
  title,
  body,
  type,
  refId,
}: {
  userId: string
  title: string
  body: string
  type: string
  refId?: string
}) {
  const supabase = await createClient()
  await supabase.from('notifications').insert({
    user_id: userId,
    title,
    body,
    type,
    ref_id: refId ?? null,
  })
}

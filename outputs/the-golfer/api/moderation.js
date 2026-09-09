import { json, requireAdmin, supabase } from '../lib/admin.js';
import { MODERATION_ACTIONS, REPORT_STATUSES } from '../lib/moderation.js';

async function writeModerationAction({ reportId = null, subjectUserId = null, actorId, action, details = {} }) {
  await supabase('moderation_actions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      report_id: reportId,
      subject_user_id: subjectUserId,
      actor_id: actorId,
      action,
      details
    })
  });
}

export default async function handler(req, res) {
  try {
    const admin = await requireAdmin(req);
    if (admin.error) return json(res, admin.error.status, admin.error.body);

    if (req.method === 'GET') {
      const view = String(req.query?.view || 'queue');
      if (view === 'queue') {
        const status = String(req.query?.status || 'open');
        const filter = REPORT_STATUSES.includes(status) ? `&status=eq.${encodeURIComponent(status)}` : '';
        const reports = await supabase(
          `player_reports?select=id,reporter_id,reported_user_id,reported_listing_id,category,details,status,created_at,updated_at,assigned_admin_id,resolution_note${filter}&order=created_at.desc&limit=100`
        );
        const actions = await supabase(
          `moderation_actions?select=id,report_id,subject_user_id,actor_id,action,details,created_at&order=created_at.desc&limit=200`
        ).catch(() => []);
        return json(res, 200, { reports, actions });
      }
      if (view === 'evidence') {
        const reportId = String(req.query?.report_id || '');
        const actions = await supabase(
          `moderation_actions?report_id=eq.${encodeURIComponent(reportId)}&select=id,action,details,created_at,actor_id&order=created_at.asc`
        );
        return json(res, 200, { actions });
      }
      return json(res, 400, { error: 'Unknown moderation view.' });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

    const action = req.body?.action;
    if (!MODERATION_ACTIONS.includes(action)) {
      return json(res, 400, { error: 'Unknown moderation action.' });
    }

    if (action === 'open_review') {
      const reportId = String(req.body?.report_id || '');
      const [updated] = await supabase(`player_reports?id=eq.${encodeURIComponent(reportId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'reviewing',
          assigned_admin_id: admin.user.id,
          updated_at: new Date().toISOString()
        })
      });
      await writeModerationAction({
        reportId,
        subjectUserId: updated?.reported_user_id || null,
        actorId: admin.user.id,
        action,
        details: { status: 'reviewing' }
      });
      return json(res, 200, { report: updated });
    }

    if (action === 'close_report') {
      const reportId = String(req.body?.report_id || '');
      const note = String(req.body?.resolution_note || '').trim() || null;
      const [updated] = await supabase(`player_reports?id=eq.${encodeURIComponent(reportId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'closed',
          resolution_note: note,
          updated_at: new Date().toISOString()
        })
      });
      await writeModerationAction({
        reportId,
        subjectUserId: updated?.reported_user_id || null,
        actorId: admin.user.id,
        action,
        details: { resolution_note: note }
      });
      return json(res, 200, { report: updated });
    }

    if (action === 'restrict_account') {
      const userId = String(req.body?.user_id || '');
      const reason = String(req.body?.reason || 'Community standards review').slice(0, 500);
      const reportId = req.body?.report_id ? String(req.body.report_id) : null;
      const [updated] = await supabase(`profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          account_restricted: true,
          account_restriction_reason: reason,
          account_restricted_at: new Date().toISOString()
        })
      });
      await writeModerationAction({
        reportId,
        subjectUserId: userId,
        actorId: admin.user.id,
        action,
        details: { reason }
      });
      return json(res, 200, { profile: updated });
    }

    if (action === 'clear_restriction') {
      const userId = String(req.body?.user_id || '');
      const reportId = req.body?.report_id ? String(req.body.report_id) : null;
      const [updated] = await supabase(`profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          account_restricted: false,
          account_restriction_reason: null,
          account_restricted_at: null
        })
      });
      await writeModerationAction({
        reportId,
        subjectUserId: userId,
        actorId: admin.user.id,
        action,
        details: {}
      });
      return json(res, 200, { profile: updated });
    }

    if (action === 'note') {
      const reportId = String(req.body?.report_id || '');
      const note = String(req.body?.note || '').trim();
      if (!note) return json(res, 400, { error: 'Note text is required.' });
      await writeModerationAction({
        reportId,
        actorId: admin.user.id,
        action,
        details: { note }
      });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'Unhandled moderation action.' });
  } catch (error) {
    const missing = /moderation_actions|account_restricted|schema cache|does not exist/i.test(error.message || '');
    return json(res, missing ? 503 : 500, {
      error: missing
        ? 'Moderation tools are not ready yet. Run 15-social-moderation-completion-migration.sql in Supabase, then try again.'
        : error.message || 'Moderation service failed.'
    });
  }
}

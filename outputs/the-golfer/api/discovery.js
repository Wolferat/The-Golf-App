export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.status(410).json({
    disabled: true,
    message: 'Scheduled AI discovery is not used. Admins run listing search and research manually. The only cron is /api/expire, which never calls OpenAI.'
  });
}

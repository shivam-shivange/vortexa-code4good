import pool from '../utils/db.js';

export const logEvent = async (req, res) => {
  const { lecture_id, event_type, details } = req.body;
  await pool.query(
    'INSERT INTO events(user_id, lecture_id, event_type, details) VALUES($1,$2,$3,$4)',
    [req.user.id, lecture_id, event_type, JSON.stringify(details)]
  );
  res.json({ message: 'Event logged' });
};

import { db } from '../app.js';

export async function getMe(req, res) {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  try {
    const [rows] = await db
      .promise()
      .query(
        'SELECT id, first_name, last_name, email, status FROM users WHERE id = ?',
        [userId]
      );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      status: 200,
      message: 'User returned successfully',
      data: rows[0],
    });
  } catch (error) {
    console.error('Error returning connected user:', error);
    return res.status(500).json({
      success: false,
      message: 'Error returning connected user',
    });
  }
}
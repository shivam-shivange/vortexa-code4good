import pool from '../utils/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Name, email, and password are required' 
      });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ 
        error: 'User already exists',
        message: 'An account with this email already exists. Please use a different email or try logging in.' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id, name, email, role, created_at',
      [name, email, hashedPassword, role || 'student']
    );
    
    const user = result.rows[0];
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ 
      message: 'Account created successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at
      },
      token 
    });
  } catch (error) {
    console.error('Signup error:', error);
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({ 
        error: 'User already exists',
        message: 'An account with this email already exists. Please use a different email or try logging in.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Something went wrong while creating your account. Please try again.' 
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Missing credentials',
        message: 'Email and password are required' 
      });
    }

    const user = (await pool.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Invalid email or password' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Invalid email or password' 
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
    res.json({ 
      message: 'Login successful',
      token, 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Something went wrong while logging in. Please try again.' 
    });
  }
};

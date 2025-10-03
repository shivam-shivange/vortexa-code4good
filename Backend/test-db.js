import db from './utils/db.js';

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...');
  
  try {
    // Test basic connection
    const result = await db.query('SELECT NOW() as current_time, version() as pg_version');
    
    console.log('✅ Database connection successful!');
    console.log('📅 Current time:', result.rows[0].current_time);
    console.log('🐘 PostgreSQL version:', result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]);
    
    // Test if our tables exist
    const tablesResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n📋 Tables in database:');
    tablesResult.rows.forEach(row => {
      console.log('  -', row.table_name);
    });
    
    // Test if we can insert/select from users table
    try {
      const userCount = await db.query('SELECT COUNT(*) as count FROM users');
      console.log('\n👥 Users in database:', userCount.rows[0].count);
    } catch (error) {
      console.log('\n❌ Users table not accessible:', error.message);
    }
    
    console.log('\n🎉 Database test completed successfully!');
    
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    
    if (error.code === '3D000') {
      console.log('\n💡 Solution: The database "new_virtual_db" does not exist.');
      console.log('   Create it with: CREATE DATABASE new_virtual_db;');
    } else if (error.code === '28P01') {
      console.log('\n💡 Solution: Authentication failed. Check your username/password in .env file.');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Solution: PostgreSQL server is not running or not accessible.');
    }
  } finally {
    // Close the connection pool
    await db.end();
    process.exit(0);
  }
}

testDatabaseConnection();

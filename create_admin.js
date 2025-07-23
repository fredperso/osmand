const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const saltRounds = 10;

rl.question('Enter username for admin: ', (username) => {
  rl.question('Enter password for admin: ', async (password) => {
    try {
      const hash = await bcrypt.hash(password, saltRounds);
      console.log('\n--- Admin User Creation ---');
      console.log('Username:', username);
      console.log('Hashed Password:', hash);
      console.log('\n--- SQL Command to Run ---');
      console.log(`INSERT INTO users (username, password_hash) VALUES ('${username}', '${hash}');`);
      console.log('--------------------------\n');
    } catch (err) {
      console.error('Error hashing password:', err);
    } finally {
      rl.close();
    }
  });
});

# Discord Balance Bot 💰

A Discord bot for managing virtual economy with balance tracking, silver transfers, and authorized balance loading features. Built with Discord.js v14 and PostgreSQL.

## ✨ Features

- 💰 **Balance System** - Users can check their virtual silver balance
- 💸 **Transfer System** - Send silver to other users with atomic transactions
- 💵 **Authorized Loading** - Staff members can load silver to user accounts
- 🔐 **Role-Based Permissions** - Only authorized roles can perform administrative actions
- 📊 **Transaction Logging** - All transfers and loads are logged for accountability
- ⚡ **Slash Commands** - Modern Discord slash command support
- 🎯 **Legacy Commands** - Classic prefix-based commands also available

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) v18.0.0 or higher
- [PostgreSQL](https://www.postgresql.org/) database
- Discord Bot Token from [Discord Developer Portal](https://discord.com/developers/applications)

## 🚀 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/discord-balance-bot.git
   cd discord-balance-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your credentials:

   - `DISCORD_BOT_TOKEN` - Your Discord bot token
   - `DATABASE_URL` - PostgreSQL connection string
   - `CLIENT_ID` - Your Discord application client ID

4. **Deploy slash commands**

   ```bash
   npm run deploy
   ```

5. **Start the bot**
   ```bash
   npm start
   ```

## 📝 Commands

### Slash Commands

| Command                          | Description                                                  |
| -------------------------------- | ------------------------------------------------------------ |
| `/balance [kullanici]`           | Check your or another user's balance (staff only for others) |
| `/transfer <kullanici> <miktar>` | Transfer silver to another user                              |
| `/yukle <kullanici> <miktar>`    | Load silver to a user's account (staff only)                 |

### Prefix Commands (!)

| Command                  | Description               |
| ------------------------ | ------------------------- |
| `!balance` or `!bal`     | Check your balance        |
| `!gonder @user <amount>` | Transfer silver to a user |
| `!yukle @user <amount>`  | Load silver (staff only)  |
| `!yardim` or `!help`     | Show help menu            |

## ⚙️ Configuration

### Authorized Roles

The following roles can use administrative commands like `/yukle`:

- Guild Master
- Right Hand
- Moderator
- Police
- Officer
- Shotcaller
- Diplomat

You can modify the `AUTHORIZED_ROLES` array in `index.js` to customize this.

### Other Settings

| Setting               | Default       | Description                        |
| --------------------- | ------------- | ---------------------------------- |
| `BASLANGIC_BAKIYESI`  | 0             | Starting balance for new users     |
| `PREFIX`              | `!`           | Command prefix for legacy commands |
| `MAX_TRANSFER_AMOUNT` | 1,000,000,000 | Maximum transfer amount            |

## 🗄️ Database Schema

The bot automatically creates the required tables on startup:

```sql
-- Users table
CREATE TABLE users (
    user_id VARCHAR(255) PRIMARY KEY,
    balance INTEGER DEFAULT 0,
    username VARCHAR(255),
    global_name VARCHAR(255),
    roles JSONB
);

-- Transaction logs
CREATE TABLE balance_logs (
    id SERIAL PRIMARY KEY,
    executor_id VARCHAR(255) NOT NULL,
    executor_name TEXT,
    target_id VARCHAR(255) NOT NULL,
    target_name TEXT,
    action_type VARCHAR(50) NOT NULL,
    amount INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 🛡️ Security Features

- **Atomic Transactions** - All transfers use PostgreSQL transactions to prevent race conditions
- **Row-Level Locking** - `SELECT ... FOR UPDATE` prevents concurrent balance manipulation
- **Input Validation** - All user inputs are validated before processing
- **Environment Variables** - Sensitive data stored in `.env` file

## 📁 Project Structure

```
discord-balance-bot/
├── index.js           # Main bot file with event handlers
├── commands.js        # Slash command definitions
├── deploy-commands.js # Script to deploy slash commands
├── package.json       # Project dependencies and scripts
├── .env.example       # Example environment variables
└── README.md          # Documentation
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Discord.js](https://discord.js.org/) - Powerful Discord API wrapper
- [node-postgres](https://node-postgres.com/) - PostgreSQL client for Node.js

---

Made with ❤️ for Discord communities

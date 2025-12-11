require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('💾 Slash komutları yükleniyor...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(c => c.toJSON()) },
    );
    console.log('✅ Slash komutları başarıyla yüklendi!');
  } catch (error) {
    console.error('❌ Slash komutu yüklenemedi:', error);
  }
})();

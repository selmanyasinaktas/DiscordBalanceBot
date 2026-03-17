require('dotenv').config()
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js')
const { Pool } = require('pg')

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error(
    '❌ DISCORD_BOT_TOKEN tanimli degil. .env dosyasini kontrol edin.'
  )
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL tanimli degil. .env dosyasini kontrol edin.')
  process.exit(1)
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
})

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const BASLANGIC_BAKIYESI = 0
const BASLANGIC_SIPHONED_ENERGY = 0
const PREFIX = '!'
const MAX_TRANSFER_AMOUNT = 1_000_000_000
const FOOTER_TEXT = 'AYS Balance Bot'
const AUTHORIZED_ROLES = [
  'Guild Master',
  'Right Hand',
  'Moderator',
  'Police',
  'Officer',
  'Shotcaller',
  'Diplomat',
]

function getFooter(client) {
  return { text: FOOTER_TEXT, iconURL: client.user.displayAvatarURL() }
}

function isPositiveIntString(value) {
  return typeof value === 'string' && /^\d+$/.test(value)
}

async function safeReply(message, payload) {
  try {
    return await message.reply(payload)
  } catch (err) {
    console.error('❌ Mesaj yanitlanamadi:', err)
  }
}

async function veritabaniBaslat() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(255) PRIMARY KEY,
        balance INTEGER DEFAULT ${BASLANGIC_BAKIYESI}
      )
    `)
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS username VARCHAR(255),
      ADD COLUMN IF NOT EXISTS global_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS roles JSONB,
      ADD COLUMN IF NOT EXISTS siphoned_energy INTEGER DEFAULT ${BASLANGIC_SIPHONED_ENERGY}
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS balance_logs (
        id SERIAL PRIMARY KEY,
        executor_id VARCHAR(255) NOT NULL,
        executor_name TEXT,
        target_id VARCHAR(255) NOT NULL,
        target_name TEXT,
        action_type VARCHAR(50) NOT NULL,
        amount INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );`)
    await pool.query(`
      ALTER TABLE balance_logs
      ADD COLUMN IF NOT EXISTS currency VARCHAR(50) NOT NULL DEFAULT 'silver'
    `)
    console.log('✅ Veritabanı başarıyla başlatıldı!')
  } catch (error) {
    console.error('❌ Veritabanı başlatma hatası:', error)
  }
}

async function kullaniciProfiliniGuncelle(member) {
  try {
    if (!member) return

    if (member.partial || !member.user || !member.user.username) {
      member = await member.fetch().catch(() => member)
    }

    if (!member.roles?.cache?.size && member.guild) {
      await member.guild.members.fetch(member.id).catch(() => {})
    }

    const userId = member.user?.id || member.id
    const username = member.user?.username || null
    const globalName =
      member.user?.globalName || member.user?.global_name || null
    const roles = member.roles?.cache
      ? Array.from(member.roles.cache.values()).map((r) => r.name)
      : []

    await pool.query(
      `INSERT INTO users (user_id, username, global_name, roles, balance, siphoned_energy)
         VALUES ($1, $2, $3, $4,
           COALESCE((SELECT balance FROM users WHERE user_id = $1::VARCHAR), $5),
           COALESCE((SELECT siphoned_energy FROM users WHERE user_id = $1::VARCHAR), $6)
         )
         ON CONFLICT (user_id) DO UPDATE SET
           username = EXCLUDED.username,
           global_name = EXCLUDED.global_name,
           roles = EXCLUDED.roles`,
      [
        userId,
        username,
        globalName,
        JSON.stringify(roles),
        BASLANGIC_BAKIYESI,
        BASLANGIC_SIPHONED_ENERGY,
      ]
    )
  } catch (error) {
    console.error('❌ Kullanıcı profili güncellenemedi:', error)
  }
}

async function bakiyeGetir(userId) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [
      userId,
    ])

    if (result.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (user_id, balance) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
        [userId, BASLANGIC_BAKIYESI]
      )
      return { balance: BASLANGIC_BAKIYESI, error: null }
    }

    return { balance: result.rows[0].balance, error: null }
  } catch (error) {
    console.error('❌ Bakiye alınamadı:', error)
    return { balance: null, error: 'Veritabanı hatası' }
  }
}

async function siphonedEnergyGetir(userId) {
  try {
    const result = await pool.query(
      'SELECT siphoned_energy FROM users WHERE user_id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (user_id, balance, siphoned_energy) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING',
        [userId, BASLANGIC_BAKIYESI, BASLANGIC_SIPHONED_ENERGY]
      )
      return { balance: BASLANGIC_SIPHONED_ENERGY, error: null }
    }

    return { balance: result.rows[0].siphoned_energy, error: null }
  } catch (error) {
    console.error('❌ Siphoned energy alınamadı:', error)
    return { balance: null, error: 'Veritabanı hatası' }
  }
}

async function silverGonder(gonderenId, aliciId, miktar) {
  const dbClient = await pool.connect()

  try {
    await dbClient.query('BEGIN')

    const gonderenSonuc = await dbClient.query(
      'SELECT balance FROM users WHERE user_id = $1 FOR UPDATE',
      [gonderenId]
    )

    if (gonderenSonuc.rows.length === 0) {
      await dbClient.query(
        'INSERT INTO users (user_id, balance) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
        [gonderenId, BASLANGIC_BAKIYESI]
      )
    }

    const mevcutBakiye =
      gonderenSonuc.rows.length > 0
        ? gonderenSonuc.rows[0].balance
        : BASLANGIC_BAKIYESI

    if (mevcutBakiye < miktar) {
      await dbClient.query('ROLLBACK')
      return { error: 'yetersiz_bakiye', balance: mevcutBakiye }
    }

    const aliciSonuc = await dbClient.query(
      'SELECT balance FROM users WHERE user_id = $1',
      [aliciId]
    )

    if (aliciSonuc.rows.length === 0) {
      await dbClient.query(
        'INSERT INTO users (user_id, balance) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
        [aliciId, BASLANGIC_BAKIYESI]
      )
    }

    const cekSonuc = await dbClient.query(
      'UPDATE users SET balance = balance - $1 WHERE user_id = $2 AND balance >= $1',
      [miktar, gonderenId]
    )

    if (cekSonuc.rowCount === 0) {
      await dbClient.query('ROLLBACK')
      return { error: 'yetersiz_bakiye', balance: mevcutBakiye }
    }

    await dbClient.query(
      'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
      [miktar, aliciId]
    )

    await dbClient.query('COMMIT')
    return { error: null }
  } catch (error) {
    await dbClient.query('ROLLBACK')
    console.error('❌ Silver transfer hatası:', error)
    return { error: 'Transfer başarısız. Lütfen tekrar deneyin.' }
  } finally {
    dbClient.release()
  }
}

async function siphonedEnergyGonder(gonderenId, aliciId, miktar) {
  const dbClient = await pool.connect()

  try {
    await dbClient.query('BEGIN')

    const gonderenSonuc = await dbClient.query(
      'SELECT siphoned_energy FROM users WHERE user_id = $1 FOR UPDATE',
      [gonderenId]
    )

    if (gonderenSonuc.rows.length === 0) {
      await dbClient.query(
        'INSERT INTO users (user_id, balance, siphoned_energy) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING',
        [gonderenId, BASLANGIC_BAKIYESI, BASLANGIC_SIPHONED_ENERGY]
      )
    }

    const mevcutBakiye =
      gonderenSonuc.rows.length > 0
        ? gonderenSonuc.rows[0].siphoned_energy
        : BASLANGIC_SIPHONED_ENERGY

    if (mevcutBakiye < miktar) {
      await dbClient.query('ROLLBACK')
      return { error: 'yetersiz_bakiye', balance: mevcutBakiye }
    }

    const aliciSonuc = await dbClient.query(
      'SELECT siphoned_energy FROM users WHERE user_id = $1',
      [aliciId]
    )

    if (aliciSonuc.rows.length === 0) {
      await dbClient.query(
        'INSERT INTO users (user_id, balance, siphoned_energy) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING',
        [aliciId, BASLANGIC_BAKIYESI, BASLANGIC_SIPHONED_ENERGY]
      )
    }

    const cekSonuc = await dbClient.query(
      'UPDATE users SET siphoned_energy = siphoned_energy - $1 WHERE user_id = $2 AND siphoned_energy >= $1',
      [miktar, gonderenId]
    )

    if (cekSonuc.rowCount === 0) {
      await dbClient.query('ROLLBACK')
      return { error: 'yetersiz_bakiye', balance: mevcutBakiye }
    }

    await dbClient.query(
      'UPDATE users SET siphoned_energy = siphoned_energy + $1 WHERE user_id = $2',
      [miktar, aliciId]
    )

    await dbClient.query('COMMIT')
    return { error: null }
  } catch (error) {
    await dbClient.query('ROLLBACK')
    console.error('❌ Siphoned energy transfer hatası:', error)
    return { error: 'Transfer başarısız. Lütfen tekrar deneyin.' }
  } finally {
    dbClient.release()
  }
}

client.on('ready', async () => {
  console.log(`🤖 ${client.user.tag} olarak giriş yapıldı!`)
  console.log(`Bot aktif! Sunucu sayısı: ${client.guilds.cache.size}`)
  await veritabaniBaslat()
})

client.on('messageCreate', async (message) => {
  if (message.author.bot) return

  if (!message.content.startsWith(PREFIX)) return

  const args = message.content.slice(PREFIX.length).trim().split(/ +/)
  const komut = args.shift().toLowerCase()

  try {
    if (message.member) {
      await kullaniciProfiliniGuncelle(message.member)
    }
  } catch (_) {}

  if (komut === 'balance' || komut === 'bal') {
    const userData = await bakiyeGetir(message.author.id)

    if (userData.error) {
      return message.reply('❌ Bakiye alınamadı. Lütfen tekrar deneyin.')
    }

    const embed = new EmbedBuilder()
      .setColor('#00b4d8')
      .setTitle('💰 Cüzdan Bilgisi')
      .setDescription(
        `🪙 **${
          message.author.username
        }**'in bakiyesi: **${userData.balance.toLocaleString('tr-TR')} Silver**`
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await safeReply(message, { embeds: [embed] })
  } else if (komut === 'energy' || komut === 'se') {
    const userData = await siphonedEnergyGetir(message.author.id)

    if (userData.error) {
      return message.reply(
        '❌ Siphoned energy bakiyesi alınamadı. Lütfen tekrar deneyin.'
      )
    }

    const embed = new EmbedBuilder()
      .setColor('#9d4edd')
      .setTitle('🔮 Siphoned Energy Bilgisi')
      .setDescription(
        `🔋 **${
          message.author.username
        }**'in siphoned energy bakiyesi: **${userData.balance.toLocaleString(
          'tr-TR'
        )} SE**`
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await safeReply(message, { embeds: [embed] })
  } else if (komut === 'gonder' || komut === 'transfer') {
    const alici = message.mentions.users.first()
    const miktarStr = args[1]
    if (!isPositiveIntString(miktarStr)) {
      return await safeReply(message, '❌ Geçerli bir miktar girin.')
    }
    const miktar = Number(miktarStr)

    if (!alici) {
      return await safeReply(message, '❌ Lütfen bir kullanıcı etiketleyin.')
    }

    if (alici.bot) {
      return await safeReply(message, '🤖 Botlara silver gönderemezsin.')
    }

    if (alici.id === message.author.id) {
      return await safeReply(message, '❌ Kendine silver gönderemezsin.')
    }

    if (miktar <= 0 || miktar > MAX_TRANSFER_AMOUNT) {
      return await safeReply(message, '❌ Geçerli bir miktar girin.')
    }

    const gonderenData = await bakiyeGetir(message.author.id)
    if (gonderenData.balance < miktar) {
      return await safeReply(
        message,
        `❌ Yetersiz bakiye! Mevcut bakiyen: **${gonderenData.balance} Silver**`
      )
    }

    const transferSonuc = await silverGonder(
      message.author.id,
      alici.id,
      miktar
    )

    if (transferSonuc.error) {
      if (transferSonuc.error === 'yetersiz_bakiye') {
        return await safeReply(
          message,
          `❌ Yetersiz bakiye! Mevcut bakiyen: **${transferSonuc.balance} Silver**`
        )
      }
      return await safeReply(message, `❌ ${transferSonuc.error}`)
    }

    const embed = new EmbedBuilder()
      .setColor('#00ff88')
      .setTitle('💸 Silver Transferi Başarılı!')
      .setDescription(
        `✨ **${message.author.username}** ➜ **${alici.username}**'e **${miktar} Silver** gönderdi!`
      )
      .addFields(
        {
          name: 'Gönderen',
          value: message.author.username,
          inline: true,
        },
        { name: 'Alıcı', value: alici.username, inline: true },
        { name: 'Miktar', value: `${miktar} 🪙 Silver`, inline: true }
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await safeReply(message, { embeds: [embed] })
    await pool.query(
      `INSERT INTO balance_logs (executor_id, executor_name, target_id, target_name, action_type, amount)
       VALUES ($1, $2, $3, $4, 'transfer', $5)`,
      [
        message.author.id,
        message.author.username,
        alici.id,
        alici.username,
        miktar,
      ]
    )
  } else if (komut === 'segonder' || komut === 'setransfer') {
    const alici = message.mentions.users.first()
    const miktarStr = args[1]
    if (!isPositiveIntString(miktarStr)) {
      return await safeReply(message, '❌ Geçerli bir miktar girin.')
    }
    const miktar = Number(miktarStr)

    if (!alici) {
      return await safeReply(message, '❌ Lütfen bir kullanıcı etiketleyin.')
    }

    if (alici.bot) {
      return await safeReply(
        message,
        '🤖 Botlara siphoned energy gönderemezsin.'
      )
    }

    if (alici.id === message.author.id) {
      return await safeReply(
        message,
        '❌ Kendine siphoned energy gönderemezsin.'
      )
    }

    if (miktar <= 0 || miktar > MAX_TRANSFER_AMOUNT) {
      return await safeReply(message, '❌ Geçerli bir miktar girin.')
    }

    const gonderenData = await siphonedEnergyGetir(message.author.id)
    if (gonderenData.balance < miktar) {
      return await safeReply(
        `❌ Yetersiz siphoned energy! Mevcut bakiyen: **${gonderenData.balance} SE**`
      )
    }

    const transferSonuc = await siphonedEnergyGonder(
      message.author.id,
      alici.id,
      miktar
    )

    if (transferSonuc.error) {
      if (transferSonuc.error === 'yetersiz_bakiye') {
        return await safeReply(
          `❌ Yetersiz siphoned energy! Mevcut bakiyen: **${transferSonuc.balance} SE**`
        )
      }
      return await safeReply(message, `❌ ${transferSonuc.error}`)
    }

    const embed = new EmbedBuilder()
      .setColor('#c77dff')
      .setTitle('🔁 Siphoned Energy Transferi Başarılı!')
      .setDescription(
        `✨ **${message.author.username}** ➜ **${alici.username}**'e **${miktar} SE** gönderdi!`
      )
      .addFields(
        {
          name: 'Gönderen',
          value: message.author.username,
          inline: true,
        },
        { name: 'Alıcı', value: alici.username, inline: true },
        { name: 'Miktar', value: `${miktar} 🔋 SE`, inline: true }
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await safeReply(message, { embeds: [embed] })
    await pool.query(
      `INSERT INTO balance_logs (executor_id, executor_name, target_id, target_name, action_type, amount, currency)
       VALUES ($1, $2, $3, $4, 'transfer', $5, 'siphoned_energy')`,
      [
        message.author.id,
        message.author.username,
        alici.id,
        alici.username,
        miktar,
      ]
    )
  } else if (komut === 'yardim' || komut === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#1d3557')
      .setTitle('📜 Komut Listesi')
      .setDescription('Aşağıda mevcut komutlar listelenmiştir:')
      .addFields(
        {
          name: '💰 /balance - !balance veya !bal ',
          value: 'Bakiyeni görüntüle',
          inline: false,
        },
        {
          name: '💰 /balance kullanici ',
          value: 'Yetkili kişilerin başka bakiyeleri görüntülemesini sağlar',
          inline: false,
        },
        {
          name: '💸 /transfer kullanici miktar veya !gonder @kullanici miktar',
          value: 'Belirtilen kullanıcıya silver gönder',
          inline: false,
        },
        {
          name: '🍷 /yukle kullanici miktar veya !yukle @kullanici miktar',
          value: 'Bu yetkili personelin yükleme yapmasını sağlar',
          inline: false,
        },
        {
          name: '🔮 /energy - !energy veya !se',
          value: 'Siphoned energy bakiyeni görüntüle',
          inline: false,
        },
        {
          name: '🔮 /energy kullanici',
          value:
            'Yetkili kişilerin başka kullanıcıların siphoned energy bakiyesini görüntülemesini sağlar',
          inline: false,
        },
        {
          name:
            '🔁 /setransfer kullanici miktar veya !segonder @kullanici miktar',
          value: 'Belirtilen kullanıcıya siphoned energy gönder',
          inline: false,
        },
        {
          name:
            '🔮 /seyukle kullanici miktar veya !seyukle @kullanici miktar (veya !seadd)',
          value:
            'Yetkili personelin bir kullanıcıya siphoned energy yüklemesini sağlar',
          inline: false,
        },
        {
          name: 'ℹ️ !yardim veya !help',
          value: 'Bu yardım menüsünü gösterir',
          inline: false,
        }
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await safeReply(message, { embeds: [embed] })
  } else if (komut === 'yukle' || komut === 'addbal') {
    const alici = message.mentions.users.first()
    const miktarStr = args[1]

    if (!isPositiveIntString(miktarStr)) {
      return await safeReply(message, '❌ Geçerli bir miktar girin.')
    }

    const miktar = Number(miktarStr)

    if (!alici) {
      return await safeReply(message, '❌ Lütfen bir kullanıcı etiketleyin.')
    }

    if (alici.bot) {
      return await safeReply(message, '🤖 Botlara silver yüklenemez.')
    }

    const memberRoles = message.member.roles.cache.map((r) => r.name)
    const yetkili = AUTHORIZED_ROLES.some((role) => memberRoles.includes(role))

    if (!yetkili) {
      return await safeReply(message, '⛔ Bu komutu kullanma yetkiniz yok.')
    }

    const aliciData = await bakiyeGetir(alici.id)
    const yeniBakiye = aliciData.balance + miktar

    await pool.query('UPDATE users SET balance = $1 WHERE user_id = $2', [
      yeniBakiye,
      alici.id,
    ])

    const embed = new EmbedBuilder()
      .setColor('#ffd700')
      .setTitle('💵 Bakiye Yükleme Başarılı')
      .setDescription(
        `🪙 **${miktar.toLocaleString('tr-TR')} Silver**, **${
          alici.username
        }** kullanıcısına yüklendi.`
      )
      .addFields(
        { name: 'Yükleyen', value: message.author.username, inline: true },
        { name: 'Alıcı', value: alici.username, inline: true },
        {
          name: 'Yeni Bakiye',
          value: `${yeniBakiye.toLocaleString('tr-TR')} 🪙`,
          inline: true,
        }
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await safeReply(message, { embeds: [embed] })
    await pool.query(
      `INSERT INTO balance_logs (executor_id, executor_name, target_id, target_name, action_type, amount)
       VALUES ($1, $2, $3, $4, 'load', $5)`,
      [
        message.author.id,
        message.author.username,
        alici.id,
        alici.username,
        miktar,
      ]
    )
  } else if (komut === 'seyukle' || komut === 'seadd') {
    const alici = message.mentions.users.first()
    const miktarStr = args[1]

    if (!isPositiveIntString(miktarStr)) {
      return await safeReply(message, '❌ Geçerli bir miktar girin.')
    }

    const miktar = Number(miktarStr)

    if (!alici) {
      return await safeReply(message, '❌ Lütfen bir kullanıcı etiketleyin.')
    }

    if (alici.bot) {
      return await safeReply(
        message,
        '🤖 Botlara siphoned energy yüklenemez.'
      )
    }

    const memberRoles = message.member.roles.cache.map((r) => r.name)
    const yetkili = AUTHORIZED_ROLES.some((role) => memberRoles.includes(role))

    if (!yetkili) {
      return await safeReply(message, '⛔ Bu komutu kullanma yetkiniz yok.')
    }

    const aliciData = await siphonedEnergyGetir(alici.id)
    const yeniBakiye = aliciData.balance + miktar

    await pool.query(
      'UPDATE users SET siphoned_energy = $1 WHERE user_id = $2',
      [yeniBakiye, alici.id]
    )

    const embed = new EmbedBuilder()
      .setColor('#f72585')
      .setTitle('🔮 Siphoned Energy Yükleme Başarılı')
      .setDescription(
        `🔋 **${miktar.toLocaleString(
          'tr-TR'
        )} SE**, **${alici.username}** kullanıcısına yüklendi.`
      )
      .addFields(
        { name: 'Yükleyen', value: message.author.username, inline: true },
        { name: 'Alıcı', value: alici.username, inline: true },
        {
          name: 'Yeni Siphoned Energy',
          value: `${yeniBakiye.toLocaleString('tr-TR')} 🔋`,
          inline: true,
        }
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await safeReply(message, { embeds: [embed] })
    await pool.query(
      `INSERT INTO balance_logs (executor_id, executor_name, target_id, target_name, action_type, amount, currency)
       VALUES ($1, $2, $3, $4, 'load', $5, 'siphoned_energy')`,
      [
        message.author.id,
        message.author.username,
        alici.id,
        alici.username,
        miktar,
      ]
    )
  }
})

client.login(process.env.DISCORD_BOT_TOKEN)

async function shutdown(signal) {
  try {
    console.log(`\n${signal} alindi, kapatiliyor...`)
    await client.destroy()
    await pool.end()
  } catch (err) {
    console.error('❌ Kapanis hatasi:', err)
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
module.exports = { client, pool }

// Slash komutlarını yakalama
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return

  const { commandName } = interaction

  // balance komutu
  if (commandName === 'balance') {
    const targetUser =
      interaction.options.getUser('kullanici') || interaction.user
    const guildMember = await interaction.guild.members.fetch(
      interaction.user.id
    )
    const memberRoles = guildMember.roles.cache.map((r) => r.name)
    const yetkili = AUTHORIZED_ROLES.some((r) => memberRoles.includes(r))

    // Başkalarının bakiyesini sorgulama kontrolü
    if (targetUser.id !== interaction.user.id && !yetkili) {
      return await interaction.reply({
        content:
          '⛔ Başka bir kullanıcının bakiyesini görüntüleme yetkiniz yok.',
        ephemeral: true,
      })
    }

    const userData = await bakiyeGetir(targetUser.id)

    if (!userData) {
      return await interaction.reply({
        content: '❌ Kullanıcının bakiyesi alınamadı.',
        ephemeral: true,
      })
    }

    const embed = new EmbedBuilder()
      .setColor('#00b4d8')
      .setTitle('💰 Cüzdan Bilgisi')
      .setDescription(
        `🪙 **${
          targetUser.username
        }**'in bakiyesi: **${userData.balance.toLocaleString('tr-TR')} Silver**`
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await interaction.reply({ embeds: [embed] })
  }

  // siphoned energy balance komutu
  else if (commandName === 'energy') {
    const targetUser =
      interaction.options.getUser('kullanici') || interaction.user
    const guildMember = await interaction.guild.members.fetch(
      interaction.user.id
    )
    const memberRoles = guildMember.roles.cache.map((r) => r.name)
    const yetkili = AUTHORIZED_ROLES.some((r) => memberRoles.includes(r))

    if (targetUser.id !== interaction.user.id && !yetkili) {
      return await interaction.reply({
        content:
          '⛔ Başka bir kullanıcının siphoned energy bakiyesini görüntüleme yetkiniz yok.',
        ephemeral: true,
      })
    }

    const userData = await siphonedEnergyGetir(targetUser.id)

    if (!userData) {
      return await interaction.reply({
        content: '❌ Kullanıcının siphoned energy bakiyesi alınamadı.',
        ephemeral: true,
      })
    }

    const embed = new EmbedBuilder()
      .setColor('#9d4edd')
      .setTitle('🔮 Siphoned Energy Bilgisi')
      .setDescription(
        `🔋 **${
          targetUser.username
        }**'in siphoned energy bakiyesi: **${userData.balance.toLocaleString(
          'tr-TR'
        )} SE**`
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await interaction.reply({ embeds: [embed] })
  }

  // transfer komutu
  else if (commandName === 'transfer') {
    const alici = interaction.options.getUser('kullanici')
    const miktar = interaction.options.getInteger('miktar')

    if (!alici || alici.bot || alici.id === interaction.user.id) {
      return await interaction.reply({
        content: '❌ Geçerli bir kullanıcı seçin.',
        ephemeral: true,
      })
    }

    if (miktar <= 0 || miktar > MAX_TRANSFER_AMOUNT) {
      return await interaction.reply({
        content: '❌ Geçerli bir miktar girin.',
        ephemeral: true,
      })
    }

    const gonderenData = await bakiyeGetir(interaction.user.id)
    if (gonderenData.balance < miktar) {
      return await interaction.reply({
        content: `❌ Yetersiz bakiye! Mevcut bakiyen: ${gonderenData.balance} Silver`,
        ephemeral: true,
      })
    }

    const transferSonuc = await silverGonder(
      interaction.user.id,
      alici.id,
      miktar
    )

    if (transferSonuc.error) {
      return await interaction.reply({
        content: `❌ ${transferSonuc.error}`,
        ephemeral: true,
      })
    }

    const embed = new EmbedBuilder()
      .setColor('#00ff88')
      .setTitle('💸 Silver Transferi Başarılı!')
      .setDescription(
        `✨ **${interaction.user.username}** ➜ **${alici.username}**'e **${miktar} Silver** gönderdi!`
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await interaction.reply({ embeds: [embed] })

    await pool.query(
      `INSERT INTO balance_logs (executor_id, executor_name, target_id, target_name, action_type, amount)
       VALUES ($1, $2, $3, $4, 'transfer', $5)`,
      [
        interaction.user.id,
        interaction.user.username,
        alici.id,
        alici.username,
        miktar,
      ]
    )
  }

  // siphoned energy transfer komutu
  else if (commandName === 'setransfer') {
    const alici = interaction.options.getUser('kullanici')
    const miktar = interaction.options.getInteger('miktar')

    if (!alici || alici.bot || alici.id === interaction.user.id) {
      return await interaction.reply({
        content: '❌ Geçerli bir kullanıcı seçin.',
        ephemeral: true,
      })
    }

    if (miktar <= 0 || miktar > MAX_TRANSFER_AMOUNT) {
      return await interaction.reply({
        content: '❌ Geçerli bir miktar girin.',
        ephemeral: true,
      })
    }

    const gonderenData = await siphonedEnergyGetir(interaction.user.id)
    if (gonderenData.balance < miktar) {
      return await interaction.reply({
        content: `❌ Yetersiz siphoned energy! Mevcut bakiyen: ${gonderenData.balance} SE`,
        ephemeral: true,
      })
    }

    const transferSonuc = await siphonedEnergyGonder(
      interaction.user.id,
      alici.id,
      miktar
    )

    if (transferSonuc.error) {
      return await interaction.reply({
        content: `❌ ${transferSonuc.error}`,
        ephemeral: true,
      })
    }

    const embed = new EmbedBuilder()
      .setColor('#c77dff')
      .setTitle('🔁 Siphoned Energy Transferi Başarılı!')
      .setDescription(
        `✨ **${interaction.user.username}** ➜ **${alici.username}**'e **${miktar} SE** gönderdi!`
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await interaction.reply({ embeds: [embed] })

    await pool.query(
      `INSERT INTO balance_logs (executor_id, executor_name, target_id, target_name, action_type, amount, currency)
       VALUES ($1, $2, $3, $4, 'transfer', $5, 'siphoned_energy')`,
      [
        interaction.user.id,
        interaction.user.username,
        alici.id,
        alici.username,
        miktar,
      ]
    )
  }

  // yukle komutu
  else if (commandName === 'yukle') {
    const alici = interaction.options.getUser('kullanici')
    const miktar = interaction.options.getInteger('miktar')

    if (!alici || alici.bot) {
      return await interaction.reply({
        content: '❌ Geçerli bir kullanıcı seçin.',
        ephemeral: true,
      })
    }

    const guildMember = await interaction.guild.members.fetch(
      interaction.user.id
    )
    const memberRoles = guildMember.roles.cache.map((r) => r.name)
    const yetkili = AUTHORIZED_ROLES.some((r) => memberRoles.includes(r))

    if (!yetkili) {
      return await interaction.reply({
        content: '⛔ Bu komutu kullanma yetkiniz yok.',
        ephemeral: true,
      })
    }

    const aliciData = await bakiyeGetir(alici.id)
    const yeniBakiye = aliciData.balance + miktar

    await pool.query('UPDATE users SET balance = $1 WHERE user_id = $2', [
      yeniBakiye,
      alici.id,
    ])

    const embed = new EmbedBuilder()
      .setColor('#ffd700')
      .setTitle('💵 Bakiye Yükleme Başarılı')
      .setDescription(
        `🪙 **${miktar.toLocaleString('tr-TR')} Silver**, **${
          alici.username
        }** kullanıcısına yüklendi.`
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await interaction.reply({ embeds: [embed] })

    await pool.query(
      `INSERT INTO balance_logs (executor_id, executor_name, target_id, target_name, action_type, amount)
       VALUES ($1, $2, $3, $4, 'load', $5)`,
      [
        interaction.user.id,
        interaction.user.username,
        alici.id,
        alici.username,
        miktar,
      ]
    )
  }

  // siphoned energy yukle komutu
  else if (commandName === 'seyukle') {
    const alici = interaction.options.getUser('kullanici')
    const miktar = interaction.options.getInteger('miktar')

    if (!alici || alici.bot) {
      return await interaction.reply({
        content: '❌ Geçerli bir kullanıcı seçin.',
        ephemeral: true,
      })
    }

    const guildMember = await interaction.guild.members.fetch(
      interaction.user.id
    )
    const memberRoles = guildMember.roles.cache.map((r) => r.name)
    const yetkili = AUTHORIZED_ROLES.some((r) => memberRoles.includes(r))

    if (!yetkili) {
      return await interaction.reply({
        content: '⛔ Bu komutu kullanma yetkiniz yok.',
        ephemeral: true,
      })
    }

    const aliciData = await siphonedEnergyGetir(alici.id)
    const yeniBakiye = aliciData.balance + miktar

    await pool.query(
      'UPDATE users SET siphoned_energy = $1 WHERE user_id = $2',
      [yeniBakiye, alici.id]
    )

    const embed = new EmbedBuilder()
      .setColor('#f72585')
      .setTitle('🔮 Siphoned Energy Yükleme Başarılı')
      .setDescription(
        `🔋 **${miktar.toLocaleString(
          'tr-TR'
        )} SE**, **${alici.username}** kullanıcısına yüklendi.`
      )
      .setFooter(getFooter(client))
      .setTimestamp()

    await interaction.reply({ embeds: [embed] })

    await pool.query(
      `INSERT INTO balance_logs (executor_id, executor_name, target_id, target_name, action_type, amount, currency)
       VALUES ($1, $2, $3, $4, 'load', $5, 'siphoned_energy')`,
      [
        interaction.user.id,
        interaction.user.username,
        alici.id,
        alici.username,
        miktar,
      ]
    )
  }
})

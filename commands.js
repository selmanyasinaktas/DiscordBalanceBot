const { SlashCommandBuilder } = require('discord.js');

module.exports = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Bakiyeni veya bir kullanıcının bakiyesini gösterir')
    .addUserOption((opt) =>
      opt
        .setName('kullanici')
        .setDescription('Bakiyesi görüntülenecek kullanıcı (yalnızca yetkililer için)')
    ),

  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Bir kullanıcıya silver gönder')
    .addUserOption((opt) =>
      opt
        .setName('kullanici')
        .setDescription('Hedef kullanıcı')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('miktar')
        .setDescription('Gönderilecek miktar')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('yukle')
    .setDescription('Yetkili personelin silver yüklemesi')
    .addUserOption((opt) =>
      opt
        .setName('kullanici')
        .setDescription('Hedef kullanıcı')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('miktar')
        .setDescription('Yüklenecek miktar')
        .setRequired(true)
    ),

  // Siphoned energy komutları
  new SlashCommandBuilder()
    .setName('energy')
    .setDescription('Siphoned energy bakiyeni veya bir kullanıcının bakiyesini gösterir')
    .addUserOption((opt) =>
      opt
        .setName('kullanici')
        .setDescription('Bakiyesi görüntülenecek kullanıcı (yalnızca yetkililer için)')
    ),

  new SlashCommandBuilder()
    .setName('setransfer')
    .setDescription('Bir kullanıcıya siphoned energy gönder')
    .addUserOption((opt) =>
      opt
        .setName('kullanici')
        .setDescription('Hedef kullanıcı')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('miktar')
        .setDescription('Gönderilecek miktar')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('seyukle')
    .setDescription('Yetkili personelin siphoned energy yüklemesi')
    .addUserOption((opt) =>
      opt
        .setName('kullanici')
        .setDescription('Hedef kullanıcı')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('miktar')
        .setDescription('Yüklenecek miktar')
        .setRequired(true)
    ),
];

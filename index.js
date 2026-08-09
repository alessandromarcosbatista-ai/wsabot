const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ChannelType, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
require('dotenv').config();

// Evita que erros não tratados derrubem o bot
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

// Prevent unhandled 'error' events from crashing the process
client.on('error', (error) => {
    console.error('Client error event:', error);
    if (error && error.data && error.data.retry_after) {
        console.warn(`Rate limited. Retry after ${error.data.retry_after} seconds.`);
    }
});

// Log WebSocket rate-limit events (discord.js/ws)
if (client.ws && typeof client.ws.on === 'function') {
    client.ws.on('rateLimit', (info) => {
        console.warn('WS Rate Limit:', info);
    });
}

// Catch uncaught exceptions to avoid process exit (log and continue)
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ CONFIGURAÇÃO — ALTERE TODAS AS IDS AQUI
// Para pegar uma ID no Discord: Ative o Modo Desenvolvedor em
// Configurações > Avançado > Modo Desenvolvedor, depois clique com botão
// direito no cargo/canal e copie a ID.
// ═══════════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────
// 🔑 CARGOS DE ADMINISTRADORES
// Adicione aqui os IDs dos cargos que podem usar /janela
// ───────────────────────────────────────────────────
const ADMIN_ROLE_IDS = [
    '1534009115448184902',   // Ex: Cargo de Staff
    '1534009116513665146',
    '1534009117557919824',
    '1534009118514348112' // Ex: Cargo de Owner
];

// ───────────────────────────────────────────────────
// 🔑 CARGOS DE PERMISSÃO (quem pode usar /contract)
// ───────────────────────────────────────────────────
const ALLOWED_COMMAND_ROLES = [
    '1534009126357696582',   // Ex: Cargo de Staff
    '1534009127699873862',   // Ex: Cargo de Owner
];

// ───────────────────────────────────────────────────
// 🏟️ CARGOS DE TIMES (clubes) PERMITIDOS EM CONTRATOS
// Coloque aqui os IDs de todos os cargos de time/clube
// ───────────────────────────────────────────────────
const ALLOWED_TEAM_ROLES = [
    '1534377238378578031',
    '1534377043763007569',
    '1534377277683535984',
    '1534377332985565376',
    '1534377419941609492',
    '1534377573167927478',
    '1534376566006616155',
    '1534377864974045357',
    '1534377090105741432',
    '1534378014018764852',
    '1534378247905870065',
    '1534378403858481162',
];

// Nomes de cargos extras permitidos (opcional, pode deixar vazio)
const ALLOWED_TEAM_ROLE_NAMES = [];

// ───────────────────────────────────────────────────
// 🟡 CARGO DE FREE AGENT
// Cargo dado automaticamente quando o jogador sai de um time
// ───────────────────────────────────────────────────
const FA_ROLE_ID = '1535745428887310337';

// ───────────────────────────────────────────────────
// ⏰ TEMPO DE EXPIRAÇÃO DO CONTRATO
// Padrão: 24 horas (em milissegundos)
// ───────────────────────────────────────────────────
const CONTRACT_EXPIRATION_TIME = 24 * 60 * 60 * 1000;

// ───────────────────────────────────────────────────
// 📗 LIMITE DO ROSTER (Roster Cap)
// Quantidade máxima de jogadores em um time
// ───────────────────────────────────────────────────
const MAX_ROSTER_SIZE = 14;
// ───────────────────────────────────────────────────

// ───────────────────────────────────────────────────
// 📌 CANAIS ONDE OS COMANDOS PODEM SER USADOS
// (restringe em quais canais o jogador pode digitar o comando)
// ───────────────────────────────────────────────────
const ALLOWED_FA_CHANNELS = [
    '1534009385226076370',         // Canal onde /fa pode ser usado
];
const ALLOWED_CONTRACT_CHANNELS = [
    '1534009385226076370',   // Canal onde /contract pode ser usado
];
const ALLOWED_RELEASE_CHANNELS = [
    '1534009385226076370',    // Canal onde /release pode ser usado
];

// ───────────────────────────────────────────────────
// 📢 CANAIS DE ANÚNCIO (onde os embeds são publicados)
// ───────────────────────────────────────────────────
const FA_ANNOUNCEMENT_CHANNEL = '1534009420252582030';             // Canal onde o anúncio de FA aparece
const CONTRACT_ANNOUNCEMENT_CHANNEL = '1534009410224128220'; // Canal onde o contrato aparece

// ═══════════════════════════════════════════════════
// 🪟 SISTEMA DE JANELA DE TRANSFERÊNCIAS
// ═══════════════════════════════════════════════════

const TRANSFER_WINDOW_FILE = './transfer_window.json';

let transferWindow = {
    clubs: false,
    freeAgent: true
};

function saveTransferWindow() {
    fs.writeFileSync(TRANSFER_WINDOW_FILE, JSON.stringify(transferWindow, null, 2));
}

function loadTransferWindow() {
    if (!fs.existsSync(TRANSFER_WINDOW_FILE)) {
        saveTransferWindow();
        return;
    }
    try {
        const data = JSON.parse(fs.readFileSync(TRANSFER_WINDOW_FILE, 'utf8'));
        transferWindow.clubs = data.clubs ?? false;
        transferWindow.freeAgent = data.freeAgent ?? true;
        console.log(`📂 Janelas carregadas — Clubs: ${transferWindow.clubs ? '🟢 Aberta' : '🔴 Fechada'} | Free Agent: ${transferWindow.freeAgent ? '🟢 Aberta' : '🔴 Fechada'}`);
    } catch (err) {
        console.error('Erro ao carregar transfer window:', err);
        saveTransferWindow();
    }
}

function buildTransferWindowEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🪟 Janela de Transferências')
        .setDescription('Selecione qual janela deseja **abrir** ou **fechar**:')
        .addFields(
            {
                name: '🏟️ Clubs',
                value: transferWindow.clubs ? '🟢 **Aberta** — Clubes podem contratar jogadores' : '🔴 **Fechada** — Clubes não podem contratar jogadores',
                inline: false
            },
            {
                name: '🟡 Free Agent',
                value: transferWindow.freeAgent ? '🟢 **Aberta** — Jogadores podem se anunciar como FA' : '🔴 **Fechada** — Jogadores não podem se anunciar como FA',
                inline: false
            }
        )
        .setFooter({ text: 'WSA Bot • Apenas Administradores' })
        .setTimestamp();
}

function buildTransferWindowSelectMenu() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('transfer_window_select')
            .setPlaceholder('Escolha qual janela deseja alternar...')
            .addOptions([
                {
                    label: `Clubs — ${transferWindow.clubs ? 'Fechar' : 'Abrir'}`,
                    value: 'clubs',
                    description: transferWindow.clubs ? 'Fechar janela de clubes' : 'Abrir janela de clubes',
                    emoji: '🏟️'
                },
                {
                    label: `Free Agent — ${transferWindow.freeAgent ? 'Fechar' : 'Abrir'}`,
                    value: 'freeAgent',
                    description: transferWindow.freeAgent ? 'Fechar anúncios de Free Agent' : 'Abrir anúncios de Free Agent',
                    emoji: '🟡'
                }
            ])
    );
}

// ═══════════════════════════════════════════════════
// 📋 SISTEMA DE CONTRATOS
// ═══════════════════════════════════════════════════

const pendingContracts = new Map();
const activeContracts = new Map();
const expirationTimers = new Map();

const CONTRACTS_FILE = './contratos.json';

function saveContracts() {
    const data = {};
    for (const [id, c] of activeContracts) {
        data[id] = {
            contractId: c.contractId,
            signee: { id: c.signee.id, username: c.signee.username },
            contractor: { id: c.contractor.id, username: c.contractor.username },
            teamName: c.teamName,
            teamRoleId: c.teamRoleId,
            position: c.position,
            role: c.role,
            proposedAt: c.proposedAt,
            signedAt: c.signedAt,
            expiresAt: c.expiresAt,
            channelId: c.channelId,
            guildId: c.guildId,
        };
    }
    fs.writeFileSync(CONTRACTS_FILE, JSON.stringify(data, null, 2));
}

function loadContracts() {
    if (!fs.existsSync(CONTRACTS_FILE)) return;
    try {
        const data = JSON.parse(fs.readFileSync(CONTRACTS_FILE, 'utf8'));
        const now = Date.now();
        for (const [id, c] of Object.entries(data)) {
            const expiresAt = new Date(c.expiresAt).getTime();
            if (expiresAt > now) {
                activeContracts.set(id, {
                    ...c,
                    signee: c.signee,
                    contractor: c.contractor,
                    proposedAt: new Date(c.proposedAt),
                    signedAt: new Date(c.signedAt),
                    expiresAt: new Date(c.expiresAt),
                });
                const remaining = expiresAt - now;
                const timer = setTimeout(async () => {
                    activeContracts.delete(id);
                    expirationTimers.delete(id);
                    saveContracts();
                    try {
                        const guild = client.guilds.cache.get(c.guildId);
                        if (guild) {
                            const channel = guild.channels.cache.get(CONTRACT_ANNOUNCEMENT_CHANNEL);
                            let member = guild.members.cache.get(c.signee.id);
                            if (!member) {
                                member = await guild.members.fetch(c.signee.id).catch(() => null);
                            }
                            if (member && c.teamRoleId) {
                                await member.roles.remove(c.teamRoleId).catch(() => { });
                            }
                            if (member) {
                                await member.roles.add(FA_ROLE_ID).catch(() => { });
                            }
                            if (channel) {
                                const expirationEmbed = new EmbedBuilder()
                                    .setColor(0xffa500)
                                    .setTitle('⏰ Contrato Expirado')
                                    .setDescription(`O contrato de **${c.signee.username}** com **${c.teamName}** expirou após 24 horas.`)
                                    .addFields(
                                        { name: 'Jogador', value: `<@${c.signee.id}>`, inline: true },
                                        { name: 'Time', value: c.teamName, inline: true },
                                        { name: 'Posição', value: c.position, inline: true },
                                    )
                                    .setFooter({ text: 'WSA Bot' })
                                    .setTimestamp();
                                await channel.send({
                                    content: `⚠️ <@${c.contractor.id}> <@${c.signee.id}>`,
                                    embeds: [expirationEmbed]
                                });
                            }
                        }
                    } catch (err) {
                        console.error('Erro na expiração:', err);
                    }
                }, remaining);
                expirationTimers.set(id, timer);
                console.log(`📂 Contrato carregado: ${c.signee.username} — ${c.teamName}`);
            } else {
                console.log(`⏰ Contrato expirado ignorado: ${c.signee.username}`);
            }
        }
        console.log(`✅ ${activeContracts.size} contrato(s) carregado(s) do disco.`);
    } catch (err) {
        console.error('Erro ao carregar contratos:', err);
    }
}

function generateContractId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000000000);
    return `T${timestamp}_${random}`;
}

function formatDate(date) {
    return date.toLocaleString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function hasCommandPermission(member) {
    if (!member) return false;
    return ALLOWED_COMMAND_ROLES.some(roleId => member.roles.cache.has(roleId));
}

function hasAdminPermission(member) {
    if (!member) return false;

    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;

    return ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

function ensureGuildInteraction(interaction) {
    if (!interaction.guild || !interaction.member) {
        interaction.reply({ content: '❌ Este comando só pode ser usado dentro de um servidor.', ephemeral: true }).catch(() => null);
        return false;
    }
    return true;
}

function isContractChannelAllowed(channelId) {
    return ALLOWED_CONTRACT_CHANNELS.includes(channelId);
}

function isFaChannelAllowed(channelId) {
    return ALLOWED_FA_CHANNELS.includes(channelId);
}

function isRoleAllowed(role) {
    if (ALLOWED_TEAM_ROLES.includes(role.id)) return true;
    if (ALLOWED_TEAM_ROLE_NAMES.includes(role.name)) return true;
    return false;
}

async function sendToChannel(guild, channelId, payload, threadName) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    if (channel.type === ChannelType.GuildForum) {
        await channel.threads.create({
            name: threadName,
            message: payload,
        });
    } else {
        await channel.send(payload);
    }
}

async function scheduleContractExpiration(contractId, contractData) {
    const timer = setTimeout(async () => {
        const contract = activeContracts.get(contractId);
        if (contract) {
            activeContracts.delete(contractId);
            expirationTimers.delete(contractId);
            saveContracts();
            try {
                const guild = client.guilds.cache.get(contract.guildId);
                if (guild) {
                    const channel = guild.channels.cache.get(CONTRACT_ANNOUNCEMENT_CHANNEL);
                    let member = guild.members.cache.get(contract.signee.id);
                    if (!member) {
                        member = await guild.members.fetch(contract.signee.id).catch(() => null);
                    }
                    if (member && contract.teamRoleId) {
                        await member.roles.remove(contract.teamRoleId).catch(err =>
                            console.error('Erro ao remover cargo:', err)
                        );
                    }
                    if (member) {
                        await member.roles.add(FA_ROLE_ID).catch(() => { });
                    }
                    if (channel) {
                        const expirationEmbed = new EmbedBuilder()
                            .setColor(0xffa500)
                            .setTitle('⏰ Contrato Expirado')
                            .setDescription(`O contrato de **${contract.signee.username}** com **${contract.teamName}** expirou após 24 horas.`)
                            .addFields(
                                { name: 'Jogador', value: `<@${contract.signee.id}>`, inline: true },
                                { name: 'Time', value: contract.teamName, inline: true },
                                { name: 'Posição', value: contract.position, inline: true },
                                { name: 'Assinado em', value: formatDate(contract.signedAt), inline: false },
                                { name: 'Expirado em', value: formatDate(new Date()), inline: false }
                            )
                            .setFooter({ text: 'WSA Bot' })
                            .setTimestamp();
                        await channel.send({
                            content: `⚠️ <@${contract.contractor.id}> <@${contract.signee.id}>`,
                            embeds: [expirationEmbed]
                        });
                    }
                }
            } catch (error) {
                console.error('Erro ao enviar notificação de expiração:', error);
            }
        }
    }, CONTRACT_EXPIRATION_TIME);
    expirationTimers.set(contractId, timer);
}

// ═══════════════════════════════════════════════════
// 📖 HELP EMBED
// ═══════════════════════════════════════════════════

function buildHelpEmbed() {
    return new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle('📖 Central de Comandos')
        .setDescription('Veja todos os comandos disponíveis abaixo:')
        .addFields(
            { name: '📋 /contract', value: 'Envia proposta de contrato\n`Uso: /contract jogador posicao role`', inline: false },
            { name: '🌍 /fa', value: 'Se tornar Free Agent\n`Uso: /fa posicao plataforma experiencia`', inline: false },
            { name: '🔓 /release', value: 'Se liberar de um time\n`Uso: /release`', inline: false },
            { name: '📂 /contratos_ativos', value: 'Ver todos os contratos ativos', inline: false },
            { name: '📄 /meu_contrato', value: 'Ver seu contrato atual', inline: false },
            { name: '🪟 /janela', value: '(Admin) Abre ou fecha a janela de transferências', inline: false },
        )
        .setFooter({ text: 'WSA Bot • Sistema Oficial' })
        .setTimestamp();
}

// ═══════════════════════════════════════════════════
// 🏗️ DEFINIÇÃO DOS SLASH COMMANDS
// ═══════════════════════════════════════════════════

const commands = [
    new SlashCommandBuilder()
        .setName('contract')
        .setDescription('Propor um contrato para um jogador')
        .addUserOption(opt => opt.setName('jogador').setDescription('O jogador que vai assinar').setRequired(true))
        .addStringOption(opt => opt.setName('posicao').setDescription('Posição do jogador (ex: cb, st, gk)').setRequired(true))
        .addStringOption(opt => opt.setName('role').setDescription('Role do jogador (ex: Titular, Subs)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('contratos_ativos')
        .setDescription('Ver todos os contratos ativos'),

    new SlashCommandBuilder()
        .setName('meu_contrato')
        .setDescription('Ver seu contrato atual'),

    new SlashCommandBuilder()
        .setName('fa')
        .setDescription('Anunciar que você está Free Agent')
        .addStringOption(opt => opt.setName('posicao').setDescription('Sua posição (ex: cb, st, gk)').setRequired(true))
        .addStringOption(opt => opt.setName('exp').setDescription('Sua experiência').setRequired(true))
        .addStringOption(opt => opt.setName('plataforma').setDescription('Sua plataforma (ex: PC, Mobile, Console)').setRequired(true))
        .addStringOption(opt => opt.setName('sobre').setDescription('Algo sobre você (opcional)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('release')
        .setDescription('Se liberar de um time e voltar a ser Free Agent'),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Ver todos os comandos disponíveis'),

    new SlashCommandBuilder()
        .setName('janela')
        .setDescription('(Admin) Abre ou fecha a janela de transferências'),
];

// ═══════════════════════════════════════════════════
// 🟢 BOT READY
// ═══════════════════════════════════════════════════

client.once('ready', async () => {
    console.log(`✅ Bot online como: ${client.user.tag}`);

    loadContracts();
    loadTransferWindow();

    client.user.setPresence({
        activities: [{ name: 'WSA Bot', type: 0 }],
        status: 'online'
    });

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands.map(cmd => cmd.toJSON()) }
        );
        console.log('✅ Slash commands registrados!');
    } catch (err) {
        console.error('Erro ao registrar commands:', err);
    }
});

// ═══════════════════════════════════════════════════
// 🚀 HANDLER DE INTERAÇÕES (SLASH + BUTTONS + SELECT)
// ═══════════════════════════════════════════════════

client.on('interactionCreate', async (interaction) => {
    try {

        // ─── SLASH COMMANDS ──────────────────────────────────
        if (interaction.isChatInputCommand()) {

        // ─── /help ─────────────────────────────────────
        if (interaction.commandName === 'help') {
            return interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
        }

        // ─── /janela ───────────────────────────────────
        if (interaction.commandName === 'janela') {
            if (!ensureGuildInteraction(interaction)) return;
            if (!hasAdminPermission(interaction.member)) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xed4245)
                            .setTitle('🔒 Acesso Negado')
                            .setDescription('Apenas **administradores** podem usar este comando.')
                            .setFooter({ text: 'WSA Bot' })
                            .setTimestamp()
                    ],
                    ephemeral: true
                });
            }

            return interaction.reply({
                embeds: [buildTransferWindowEmbed()],
                components: [buildTransferWindowSelectMenu()],
                ephemeral: true
            });
        }

        // ═══════════════════════════════════════════════════
        // 📋 COMANDO /contract
        // ═══════════════════════════════════════════════════

        if (interaction.commandName === 'contract') {
            if (!ensureGuildInteraction(interaction)) return;
            await interaction.deferReply({ ephemeral: true });

            if (!isContractChannelAllowed(interaction.channelId)) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Canal Não Permitido').setDescription('Este comando só pode ser utilizado em canais específicos.').setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            if (!hasCommandPermission(interaction.member)) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Sem Permissão').setDescription('Você não tem permissão para usar este comando.\n\nApenas membros autorizados podem criar contratos.').setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            const signee = interaction.options.getUser('jogador');
            const position = interaction.options.getString('posicao');
            const role = interaction.options.getString('role');
            const contractor = interaction.user;
            const contractorMember = interaction.member;

            const teamRoles = [];
            ALLOWED_TEAM_ROLES.forEach(roleId => {
                if (contractorMember.roles.cache.has(roleId)) {
                    const tRole = interaction.guild.roles.cache.get(roleId);
                    if (tRole) teamRoles.push(tRole);
                }
            });

            if (teamRoles.length === 0) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Sem Time').setDescription('Você não possui um cargo de time para propor contratos.').setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            const teamRole = teamRoles[0]; // Pega o primeiro time encontrado
            const isTeamContract = true; // Sempre true agora pois é garantido

            // Use cached role members instead of a bulk fetch to avoid gateway rate limits.
            const rosterSize = teamRole.members.cache.size;

            if (rosterSize >= MAX_ROSTER_SIZE) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🚫 Roster Cap Atingido').setDescription(`O time **${teamRole.name}** já atingiu o limite máximo de ${MAX_ROSTER_SIZE} jogadores.\nRemova algum jogador para poder enviar um novo contrato.`).setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            // Verificar janela de clubs
            if (isTeamContract) {
                if (!transferWindow.clubs) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xed4245)
                                .setTitle('🚫 Janela de Clubs Fechada')
                                .setDescription('A janela de transferências para **clubes** está fechada no momento.')
                                .setFooter({ text: 'WSA Bot • Janela de transferências fechada para clubes' })
                                .setTimestamp()
                        ]
                    });
                }
            }

            // Verificar se cargo é permitido
            if (!isRoleAllowed(teamRole)) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Cargo Não Permitido').setDescription(`O cargo **${teamRole.name}** não está autorizado para contratos.\n\nApenas cargos de times podem ser usados.`).setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            // Bloquear cargos administrativos
            if (
                teamRole.permissions.has(PermissionFlagsBits.Administrator) ||
                teamRole.permissions.has(PermissionFlagsBits.ManageGuild) ||
                teamRole.permissions.has(PermissionFlagsBits.ManageRoles)
            ) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Cargo Administrativo Bloqueado').setDescription(`Por segurança, cargos com permissões administrativas não podem ser usados em contratos.`).setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            const contractId = generateContractId();

            const contractData = {
                contractId,
                signee,
                contractor,
                teamName: teamRole.name,
                teamRoleId: teamRole.id,
                position,
                role,
                proposedAt: new Date(),
                channelId: interaction.channelId,
                guildId: interaction.guildId,
            };

            pendingContracts.set(contractId, contractData);

            const embed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setTitle('📋 Agreement Contract')
                .setDescription(`By signing this contract, you commit to representing the Contractor and their team with dedication throughout the tournament, competing to the best of your abilities and upholding team loyalty.`)
                .addFields(
                    { name: 'Signee', value: `${signee}\n${signee.username}`, inline: true },
                    { name: 'Contractor', value: `${contractor}\n${contractor.username}`, inline: true },
                    { name: 'Team', value: teamRole.name, inline: true },
                    { name: 'Position', value: position, inline: true },
                    { name: 'Role', value: role, inline: true },
                    { name: '📗 Roster Cap', value: `${rosterSize}/${MAX_ROSTER_SIZE}`, inline: true },
                )
                .setFooter({ text: `WSA Bot • ${new Date().toLocaleDateString('pt-BR')}` })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`accept_${contractId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_${contractId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
            );

            try {
                await sendToChannel(
                    interaction.guild,
                    CONTRACT_ANNOUNCEMENT_CHANNEL,
                    {
                        content: `🔔 ${signee}, um contrato foi proposto por ${contractor}.`,
                        embeds: [embed],
                        components: [row],
                    },
                    `Contract — ${signee.username}`
                );
            } catch (err) {
                console.error('❌ Erro ao enviar contract no canal de anúncios:', err);
            }

            await interaction.editReply({ content: '✅ Contrato enviado para o canal de contratos!' });

            // Tentar enviar DM para o jogador
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('📋 Contract Recebido!')
                    .setDescription(`Você recebeu um **offer de contract**!`)
                    .addFields(
                        { name: '👕 Time', value: teamRole.name, inline: true },
                        { name: '⚽ Posição', value: position, inline: true },
                        { name: '👤 Enviado por', value: contractor.username, inline: false },
                    )
                    .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                    .setFooter({ text: 'WSA Bot • Responda o mais rápido possível!' })
                    .setTimestamp();

                await signee.send({ embeds: [dmEmbed] });
                console.log(`✅ DM de contrato enviada para ${signee.username}`);
            } catch (err) {
                console.log(`⚠️ Não foi possível enviar DM para ${signee.username}: ${err.message}`);
            }
        }

        // ═══════════════════════════════════════════════════
        // 📂 COMANDO /contratos_ativos
        // ═══════════════════════════════════════════════════

        else if (interaction.commandName === 'contratos_ativos') {
            if (!ensureGuildInteraction(interaction)) return;
            await interaction.deferReply({ ephemeral: true });

            if (!hasCommandPermission(interaction.member)) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Sem Permissão').setDescription('Você não tem permissão para usar este comando.').setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            if (activeContracts.size === 0) {
                return interaction.editReply({ content: '📭 Nenhum contrato ativo no momento.' });
            }

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('📂 Contratos Ativos')
                .setFooter({ text: `Total: ${activeContracts.size} contrato(s)` })
                .setTimestamp();

            for (const [id, c] of activeContracts) {
                embed.addFields({
                    name: `${c.teamName} — ${c.signee.username}`,
                    value: `**Posição:** ${c.position}\n**Contratante:** ${c.contractor.username}\n**Assinado em:** ${formatDate(c.signedAt)}`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
        }

        // ═══════════════════════════════════════════════════
        // 📄 COMANDO /meu_contrato
        // ═══════════════════════════════════════════════════

        else if (interaction.commandName === 'meu_contrato') {
            if (!ensureGuildInteraction(interaction)) return;
            await interaction.deferReply({ ephemeral: true });

            if (!hasCommandPermission(interaction.member)) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Sem Permissão').setDescription('Você não tem permissão para usar este comando.').setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            const userContract = [...activeContracts.values()].find(c => c.signee.id === interaction.user.id);
            if (!userContract) {
                return interaction.editReply({ content: '📭 Você não possui contrato ativo.' });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('✅ Seu Contrato Ativo')
                .addFields(
                    { name: 'Time', value: userContract.teamName, inline: true },
                    { name: 'Posição', value: userContract.position, inline: true },
                    { name: 'Contratante', value: `${userContract.contractor}`, inline: true },
                    { name: 'Assinado em', value: formatDate(userContract.signedAt), inline: false },
                )
                .setFooter({ text: 'WSA Bot' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }

        // ═══════════════════════════════════════════════════
        // 🌍 COMANDO /fa
        // ═══════════════════════════════════════════════════

        else if (interaction.commandName === 'fa') {
            if (!ensureGuildInteraction(interaction)) return;
            await interaction.deferReply({ ephemeral: true });

            // Verificar janela de FA
            if (!transferWindow.freeAgent) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xed4245)
                            .setTitle('🚫 Janela de Free Agent Fechada')
                            .setDescription('Os anúncios de **Free Agent** estão desativados no momento.\nAguarde a abertura da janela para se anunciar.')
                            .setFooter({ text: 'WSA Bot • Janela de FA fechada' })
                            .setTimestamp()
                    ]
                });
            }

            if (!isFaChannelAllowed(interaction.channelId)) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Canal Não Permitido').setDescription('Este comando só pode ser utilizado em canais específicos.').setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            // Verificar se já está em um time
            const hasTeamRole = ALLOWED_TEAM_ROLES.some(id => interaction.member.roles.cache.has(id));
            if (hasTeamRole) {
                return interaction.editReply({
                    content: `❌ Você já é de um time! Se quiser sair, use **/release**.`,
                });
            }

            const posicao = interaction.options.getString('posicao');
            const exp = interaction.options.getString('exp');
            const plataforma = interaction.options.getString('plataforma');
            const sobre = interaction.options.getString('sobre');

            const faEmbed = new EmbedBuilder()
                .setColor(0xf0c030)
                .setTitle('📢 Free Agent')
                .setDescription(`${interaction.user} está disponível para ser contratado!`)
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Posição', value: posicao, inline: true },
                    { name: 'Plataforma', value: plataforma, inline: true },
                    { name: 'Experiência', value: exp, inline: false },
                );

            if (sobre) {
                faEmbed.addFields({ name: '💬 Sobre', value: sobre, inline: false });
            }

            faEmbed
                .setFooter({ text: `WSA Bot • ${new Date().toLocaleDateString('pt-BR')}` })
                .setTimestamp();

            await interaction.editReply({ content: '✅ Seu anúncio de Free Agent foi publicado!' });

            try {
                await sendToChannel(interaction.guild, FA_ANNOUNCEMENT_CHANNEL, { embeds: [faEmbed] }, `FA — ${interaction.user.username}`);
            } catch (err) {
                console.error('❌ Erro ao enviar FA no canal de anúncios:', err);
            }
        }

        // ═══════════════════════════════════════════════════
        // 🔓 COMANDO /release
        // ═══════════════════════════════════════════════════

        else if (interaction.commandName === 'release') {
            if (!ensureGuildInteraction(interaction)) return;
            await interaction.deferReply({ ephemeral: true });

            if (!ALLOWED_RELEASE_CHANNELS.includes(interaction.channelId)) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Canal Não Permitido').setDescription('Este comando só pode ser utilizado em canais específicos.').setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            const member = interaction.member;

            const teamRoles = [];

            ALLOWED_TEAM_ROLES.forEach(roleId => {
                if (member.roles.cache.has(roleId)) {
                    const role = interaction.guild.roles.cache.get(roleId);
                    if (role) teamRoles.push({ id: roleId, name: role.name, type: 'team' });
                }
            });

            const allOwnedRoles = [...teamRoles];

            if (allOwnedRoles.length === 0) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Sem Time').setDescription('Você não possui nenhum cargo de time para se liberar.').setFooter({ text: 'WSA Bot' }).setTimestamp()]
                });
            }

            const releaseFromRole = async (roleId, roleName) => {
                try {
                    await member.roles.remove(roleId);

                    // Cancelar contrato ativo se existir
                    for (const [id, c] of activeContracts) {
                        if (c.signee.id === interaction.user.id) {
                            activeContracts.delete(id);
                            const timer = expirationTimers.get(id);
                            if (timer) {
                                clearTimeout(timer);
                                expirationTimers.delete(id);
                            }
                            saveContracts();
                            break;
                        }
                    }

                    // Adicionar cargo de FA se não tiver mais nenhum time
                    const stillHasTeam = ALLOWED_TEAM_ROLES.some(rid => member.roles.cache.has(rid));
                    if (!stillHasTeam) {
                        await member.roles.add(FA_ROLE_ID);
                    }

                    const releaseEmbed = new EmbedBuilder()
                        .setColor(0xf0c030)
                        .setTitle('🔓 Liberação Confirmada')
                        .setDescription(`${interaction.user} não faz mais parte de **${roleName}**.`)
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                        .addFields(
                            { name: 'Jogador', value: `${interaction.user}`, inline: true },
                            { name: 'Cargo Removido', value: roleName, inline: true },
                            { name: 'Status', value: stillHasTeam ? 'Ainda em outro time' : '🟡 Free Agent', inline: true },
                        )
                        .setFooter({ text: `WSA Bot • ${new Date().toLocaleDateString('pt-BR')}` })
                        .setTimestamp();

                    return releaseEmbed;
                } catch (err) {
                    console.error('❌ Erro ao liberar jogador:', err);
                    throw err;
                }
            };

            const singleRole = allOwnedRoles[0];
            try {
                const embed = await releaseFromRole(singleRole.id, singleRole.name);
                await interaction.editReply({ embeds: [embed] });
            } catch {
                await interaction.editReply({ content: '❌ Ocorreu um erro ao processar sua liberação. Verifique se o bot tem permissão para gerenciar cargos.' });
            }
        }
    }

    // ═══════════════════════════════════════════════════
    // 🔘 BOTÕES (Accept / Reject contrato)
    // ═══════════════════════════════════════════════════

    if (interaction.isButton()) {
        const [action, contractId] = interaction.customId.split('_').reduce((acc, part, i) => {
            if (i === 0) acc[0] = part;
            else acc[1] = (acc[1] ? acc[1] + '_' + part : part);
            return acc;
        }, []);

        const contractData = pendingContracts.get(contractId);
        if (!contractData) {
            return interaction.reply({ content: '❌ Contrato não encontrado ou já processado.', ephemeral: true });
        }

        if (interaction.user.id !== contractData.signee.id) {
            return interaction.reply({ content: '❌ Apenas o jogador indicado pode aceitar ou rejeitar este contrato.', ephemeral: true });
        }

        if (action === 'accept') {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + CONTRACT_EXPIRATION_TIME);

            const signedContract = { ...contractData, signedAt: now, expiresAt: expiresAt };

            activeContracts.set(contractId, signedContract);
            pendingContracts.delete(contractId);
            saveContracts();

            scheduleContractExpiration(contractId, signedContract);

            // Adicionar cargo do time e remover FA
            try {
                const guild = interaction.guild;
                let member = interaction.member || guild.members.cache.get(contractData.signee.id);
                if (!member) {
                    member = guild.members.cache.get(contractData.signee.id);
                }
                if (member && contractData.teamRoleId) {
                    await member.roles.add(contractData.teamRoleId);
                    console.log(`✅ Cargo ${contractData.teamName} adicionado a ${member.user.tag}`);
                }
                if (member && member.roles.cache.has(FA_ROLE_ID)) {
                    await member.roles.remove(FA_ROLE_ID);
                    console.log(`🗑️ Cargo FA removido de ${member.user.tag}`);
                }
            } catch (err) {
                console.error('❌ Erro ao adicionar/remover cargo:', err);
            }

            const successEmbed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Contract Accepted')
                .setDescription(`${contractData.signee} has successfully signed with **${contractData.teamName}**`)
                .addFields(
                    { name: 'Signee', value: `${contractData.signee}\n${contractData.signee.username}`, inline: true },
                    { name: 'Contractor', value: `${contractData.contractor}\n${contractData.contractor.username}`, inline: true },
                    { name: 'Team', value: contractData.teamName, inline: true },
                    { name: 'Position', value: contractData.position, inline: true },
                    { name: 'Role', value: contractData.role, inline: true },
                    { name: 'Signed on', value: `<t:${Math.floor(now.getTime() / 1000)}:F>`, inline: false },
                )
                .setFooter({ text: `WSA Bot • ${new Date().toLocaleDateString('pt-BR')}` })
                .setTimestamp();

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('disabled_accept').setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId('disabled_reject').setLabel('Reject').setStyle(ButtonStyle.Danger).setDisabled(true)
            );

            await interaction.update({ content: `✅ ${contractData.signee} accepted the contract!`, embeds: [successEmbed], components: [disabledRow] });

        } else if (action === 'reject') {
            pendingContracts.delete(contractId);

            const rejectEmbed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('❌ Contract Rejected')
                .setDescription(`${contractData.signee} rejected the contract proposed by ${contractData.contractor} for team **${contractData.teamName}**.`)
                .setFooter({ text: 'WSA Bot' })
                .setTimestamp();

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('disabled_accept').setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId('disabled_reject').setLabel('Reject').setStyle(ButtonStyle.Danger).setDisabled(true)
            );

            await interaction.update({ content: `❌ ${contractData.signee} rejected the contract.`, embeds: [rejectEmbed], components: [disabledRow] });
        }
    }

    // ═══════════════════════════════════════════════════
    // 📋 SELECT MENUS
    // ═══════════════════════════════════════════════════

    if (interaction.isStringSelectMenu()) {

        // 🪟 Janela de Transferências
        if (interaction.customId === 'transfer_window_select') {
            const selected = interaction.values[0];
            transferWindow[selected] = !transferWindow[selected];
            saveTransferWindow();

            const nomeLegivel = selected === 'clubs' ? '🏟️ Clubs' : '🟡 Free Agent';
            const novoEstado = transferWindow[selected] ? '🟢 **Aberta**' : '🔴 **Fechada**';

            console.log(`🪟 Janela "${selected}" alterada para: ${transferWindow[selected] ? 'ABERTA' : 'FECHADA'} por ${interaction.user.tag}`);

            await interaction.update({
                embeds: [buildTransferWindowEmbed()],
                components: [buildTransferWindowSelectMenu()]
            });

            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor(transferWindow[selected] ? 0x57f287 : 0xed4245)
                        .setTitle('🪟 Janela Atualizada')
                        .setDescription(`A janela **${nomeLegivel}** foi alterada para ${novoEstado}.`)
                        .setFooter({ text: `WSA Bot • Alterado por ${interaction.user.username}` })
                        .setTimestamp()
                ],
                ephemeral: true
            });

            return;
        }


    }
} catch (err) {
    console.error('Erro no interactionCreate:', err);
    if (interaction?.deferred || interaction?.replied) {
        await interaction.followUp({ content: '❌ Ocorreu um erro interno. Tente novamente mais tarde.', ephemeral: true }).catch(() => null);
    } else {
        await interaction.reply({ content: '❌ Ocorreu um erro interno. Tente novamente mais tarde.', ephemeral: true }).catch(() => null);
    }
}
});

client.login(process.env.DISCORD_TOKEN);
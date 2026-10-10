const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const fs = require("fs");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// =====================================================
// الإعدادات
// =====================================================

const WARN_CHANNEL_ID = "1558225197117743238";
const ATTENDANCE_CHANNEL_ID = "1556509433289244702";

const TASK_WARN_ROLES = [
  "1551001629656883200",
  "1551001910524256366",
  "1551001972205813950"
];

const ABSENCE_WARN_ROLES = [
  "1550994651769475102",
  "1550995580908605591",
  "1550995666036330607"
];

const EXCLUDED_TASK_ROLES = [
  "1546134518463856760",
  "1546140695314571304"
];

const EXCLUDED_USERS = [
  "1187451850107134002",
  "1013168743750316142",
  "1328100209636413461",
  "1529637881444962538",
  "703007354777632788",
  "1010434831001325608",
  "1262517138569297963",
  "1393759774793011301",
  "1246467979642798120",
  "818562145079263292",
  "1399163417981620327",
  "476230462164041749",
  "1332842326824980553"
];

// =====================================================
// رولات الغرامات
// =====================================================

const FINE_ROLES = {
  "عدم انصياع للأوامر": "1556929931500326912",
  "أشياء غير لائقة": "1556929974852780053",
  "التأخير عن مهمة": "1556930071833346057",
  "الغياب بدون إذن": "1556929805818003516",
  "مخالفة قوانين العصابة": "1556929755691876403"
};

const FINE_DURATION = 48 * 60 * 60 * 1000;

// =====================================================
// بيانات لوحة الحضور
// =====================================================

const ATTENDANCE_PANEL_FILE = "./attendance_panel.json";

if (!fs.existsSync(ATTENDANCE_PANEL_FILE)) {
  fs.writeFileSync(
    ATTENDANCE_PANEL_FILE,
    "{}"
  );
}

function loadAttendancePanel() {
  try {
    return JSON.parse(
      fs.readFileSync(
        ATTENDANCE_PANEL_FILE,
        "utf8"
      )
    );
  } catch {
    return {};
  }
}

function saveAttendancePanel(data) {
  fs.writeFileSync(
    ATTENDANCE_PANEL_FILE,
    JSON.stringify(data, null, 2)
  );
}

// =====================================================
// الاستثناء الكامل
// =====================================================

function isFullyExcluded(memberOrId) {
  const id =
    typeof memberOrId === "string"
      ? memberOrId
      : memberOrId?.id;

  return EXCLUDED_USERS.includes(id);
}

// =====================================================
// ملف البيانات
// =====================================================

const DATA_FILE = "./players.json";

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "{}");
}

function loadData() {
  try {
    return JSON.parse(
      fs.readFileSync(
        DATA_FILE,
        "utf8"
      )
    );
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );
}

// =====================================================
// التاريخ بتوقيت مصر
// =====================================================

function egyptDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

// =====================================================
// الساعة بتوقيت مصر
// =====================================================

function egyptHour(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      hour: "2-digit",
      hour12: false
    }).format(date)
  );
}

// =====================================================
// فرق الأيام
// =====================================================

function daysBetween(date1, date2) {
  const a =
    new Date(date1 + "T00:00:00+03:00");

  const b =
    new Date(date2 + "T00:00:00+03:00");

  return Math.floor(
    (b - a) / 86400000
  );
}

// =====================================================
// تحويل الثواني لوقت مفهوم
// =====================================================

function formatPlayTime(totalSeconds = 0) {
  totalSeconds = Math.max(
    0,
    Math.floor(Number(totalSeconds) || 0)
  );

  const hours =
    Math.floor(totalSeconds / 3600);

  const minutes =
    Math.floor((totalSeconds % 3600) / 60);

  const seconds =
    totalSeconds % 60;

  if (hours > 0) {
    return `${hours}س ${minutes}د`;
  }

  if (minutes > 0) {
    return `${minutes}د ${seconds}ث`;
  }

  return `${seconds}ث`;
}

// =====================================================
// وقت اللعب المحفوظ لليوم
// =====================================================

function getSavedDailyPlayTime(player, date = egyptDate()) {
  if (!player) return 0;

  // النظام الجديد
  if (
    player.playTimeByDate &&
    typeof player.playTimeByDate === "object"
  ) {
    return Number(
      player.playTimeByDate[date] || 0
    );
  }

  // توافق مع أي بيانات قديمة
  if (
    player.dailyPlayTimeDate === date &&
    player.dailyPlayTimeSeconds
  ) {
    return Number(
      player.dailyPlayTimeSeconds
    );
  }

  return 0;
}

// =====================================================
// وقت اللعب الحالي لليوم
// =====================================================

function getCurrentDailyPlayTime(
  player,
  date = egyptDate()
) {
  let total =
    getSavedDailyPlayTime(
      player,
      date
    );

  if (
    player?.presentToday &&
    player.attendanceStartedAt
  ) {
    const startedAt =
      new Date(
        player.attendanceStartedAt
      ).getTime();

    if (!Number.isNaN(startedAt)) {
      const now =
        Date.now();

      const extra =
        Math.max(
          0,
          Math.floor(
            (now - startedAt) / 1000
          )
        );

      total += extra;
    }
  }

  return total;
}

// =====================================================
// إجمالي وقت اللعب
// =====================================================

function getTotalPlayTime(player) {
  if (!player) return 0;

  let total =
    Number(
      player.totalPlayTimeSeconds || 0
    );

  // لو فيه جلسة حالية مفتوحة
  if (
    player.presentToday &&
    player.attendanceStartedAt
  ) {
    const startedAt =
      new Date(
        player.attendanceStartedAt
      ).getTime();

    if (!Number.isNaN(startedAt)) {
      total += Math.max(
        0,
        Math.floor(
          (Date.now() - startedAt) /
          1000
        )
      );
    }
  }

  return total;
}

// =====================================================
// إضافة وقت لعب
// =====================================================

function addPlayTime(
  player,
  date,
  seconds
) {
  seconds =
    Math.max(
      0,
      Math.floor(
        Number(seconds) || 0
      )
    );

  if (!player.playTimeByDate) {
    player.playTimeByDate = {};
  }

  player.playTimeByDate[date] =
    Number(
      player.playTimeByDate[date] || 0
    ) + seconds;

  player.totalPlayTimeSeconds =
    Number(
      player.totalPlayTimeSeconds || 0
    ) + seconds;

  player.dailyPlayTimeDate = date;

  player.dailyPlayTimeSeconds =
    Number(
      player.playTimeByDate[date] || 0
    );
}

// =====================================================
// إغلاق جلسة الحضور
// =====================================================

function closeAttendanceSession(
  player,
  endDate = egyptDate()
) {
  if (
    !player.presentToday ||
    !player.attendanceStartedAt
  ) {
    return 0;
  }

  const startTime =
    new Date(
      player.attendanceStartedAt
    ).getTime();

  const endTime =
    Date.now();

  if (Number.isNaN(startTime)) {
    player.attendanceStartedAt =
      null;

    player.presentToday = false;

    return 0;
  }

  const seconds =
    Math.max(
      0,
      Math.floor(
        (endTime - startTime) /
        1000
      )
    );

  addPlayTime(
    player,
    endDate,
    seconds
  );

  player.attendanceStartedAt =
    null;

  player.presentToday = false;

  return seconds;
}

// =====================================================
// استثناء التاسكات
// =====================================================

function isExcluded(member) {
  return member.roles.cache.some(role =>
    EXCLUDED_TASK_ROLES.includes(role.id)
  );
}

function isTaskExcluded(member) {
  return (
    isFullyExcluded(member) ||
    isExcluded(member)
  );
}

// =====================================================
// إنشاء بيانات العضو
// =====================================================

function ensurePlayer(data, user) {
  if (!data[user.id]) {
    data[user.id] = {
      name: user.username,

      attendance: [],
      lastAttendance: null,
      presentToday: false,

      // نظام وقت اللعب
      attendanceStartedAt: null,
      playTimeByDate: {},
      totalPlayTimeSeconds: 0,
      dailyPlayTimeDate: null,
      dailyPlayTimeSeconds: 0,

      tasks: [],
      taskWarns: 0,
      absenceWarns: 0,
      totalWarns: 0,
      fines: [],
      points: 0,
      vacations: [],
      lastAbsenceCheck: null,
      lastReset: null
    };
  }

  const player = data[user.id];

  player.name = user.username;

  player.attendance ||= [];
  player.tasks ||= [];
  player.fines ||= [];
  player.vacations ||= [];

  player.taskWarns ||= 0;
  player.absenceWarns ||= 0;
  player.totalWarns ||= 0;
  player.points ||= 0;

  // ===================================================
  // تحويل بيانات الأعضاء القديمة للنظام الجديد
  // ===================================================

  player.playTimeByDate ||= {};

  player.totalPlayTimeSeconds =
    Number(
      player.totalPlayTimeSeconds || 0
    );

  player.dailyPlayTimeSeconds =
    Number(
      player.dailyPlayTimeSeconds || 0
    );

  if (
    player.dailyPlayTimeDate === undefined
  ) {
    player.dailyPlayTimeDate = null;
  }

  if (
    player.attendanceStartedAt === undefined
  ) {
    player.attendanceStartedAt = null;
  }

  return player;
}

// =====================================================
// صلاحيات الإدارة
// =====================================================

function isAdmin(interaction) {
  return interaction.member.permissions.has(
    PermissionFlagsBits.ManageGuild
  );
}

// =====================================================
// تحديث لوحة الحاضرين
// =====================================================

async function updateAttendancePanel(
  guild,
  data = null
) {
  try {
    const attendanceData =
      data || loadData();

    const panelData =
      loadAttendancePanel();

    const channel =
      await guild.channels.fetch(
        ATTENDANCE_CHANNEL_ID
      );

    if (!channel) return;

    let panelMessage = null;

    if (panelData.panelMessageId) {
      try {
        panelMessage =
          await channel.messages.fetch(
            panelData.panelMessageId
          );
      } catch {
        panelMessage = null;
      }
    }

    if (!panelMessage) {
      const embed =
        new EmbedBuilder()
          .setTitle("📋 لوحة الحاضرين")
          .setDescription(
            "⏳ جاري تحميل الحاضرين..."
          )
          .setTimestamp();

      panelMessage =
        await channel.send({
          embeds: [embed]
        });

      panelData.panelMessageId =
        panelMessage.id;

      saveAttendancePanel(
        panelData
      );
    }

    const presentUsers = [];

    for (
      const [userId, player]
      of Object.entries(
        attendanceData
      )
    ) {
      if (
        isFullyExcluded(userId)
      ) {
        continue;
      }

      if (
        player.presentToday === true
      ) {
        presentUsers.push(userId);
      }
    }

    let description;

    if (
      presentUsers.length === 0
    ) {
      description =
        "📭 **مفيش حد مسجل حضور حاليًا.**";
    } else {
      const membersList = [];

      for (
        const userId
        of presentUsers
      ) {
        const player =
          attendanceData[userId];

        const playSeconds =
          getCurrentDailyPlayTime(
            player
          );

        membersList.push(
          `🟢 <@${userId}> — ⏱️ **${formatPlayTime(playSeconds)}**`
        );
      }

      description =
        `👥 **عدد الحاضرين: ${presentUsers.length}**\n\n` +
        membersList.join("\n");

      if (
        description.length > 4000
      ) {
        description =
          `👥 **عدد الحاضرين: ${presentUsers.length}**\n\n` +
          membersList
            .slice(0, 100)
            .join("\n") +
          "\n\n⚠️ تم اختصار القائمة بسبب عدد الأعضاء.";
      }
    }

    const embed =
      new EmbedBuilder()
        .setTitle("📋 لوحة الحاضرين")
        .setDescription(description)
        .setFooter({
          text:
            "⏱️ الوقت بيتحدث تلقائيًا أثناء الحضور"
        })
        .setTimestamp();

    await panelMessage.edit({
      embeds: [embed]
    });

  } catch (error) {
    console.log(
      "⚠️ خطأ في تحديث لوحة الحاضرين:",
      error.message
    );
  }
}

// =====================================================
// إنشاء لوحة الحضور والانصراف
// =====================================================

async function setupAttendancePanel(
  guild
) {
  try {
    const channel =
      await guild.channels.fetch(
        ATTENDANCE_CHANNEL_ID
      );

    if (!channel) return;

    const panelData =
      loadAttendancePanel();

    let attendanceMessage = null;

    if (
      panelData.attendanceMessageId
    ) {
      try {
        attendanceMessage =
          await channel.messages.fetch(
            panelData.attendanceMessageId
          );
      } catch {
        attendanceMessage = null;
      }
    }

    if (!attendanceMessage) {
      const embed =
        new EmbedBuilder()
          .setTitle(
            "🕐 تسجيل الحضور والانصراف"
          )
          .setDescription(
            "اضغط على الزر المناسب لتسجيل حالتك.\n\n" +
            "🟢 **تسجيل حضور**\n" +
            "سجل حضورك واسمك هيظهر في لوحة الحاضرين.\n\n" +
            "🔴 **تسجيل انصراف**\n" +
            "سجل انصرافك واسمك هيتشال من لوحة الحاضرين.\n\n" +
            "⏱️ **وقت اللعب بيتحسب تلقائيًا من وقت الحضور للانصراف.**"
          )
          .setFooter({
            text:
              "كل عضو يقدر يستخدم الأزرار بنفسه"
          })
          .setTimestamp();

      const row =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                "attendance_check_in"
              )
              .setLabel(
                "تسجيل حضور"
              )
              .setEmoji("🟢")
              .setStyle(
                ButtonStyle.Success
              ),

            new ButtonBuilder()
              .setCustomId(
                "attendance_check_out"
              )
              .setLabel(
                "تسجيل انصراف"
              )
              .setEmoji("🔴")
              .setStyle(
                ButtonStyle.Danger
              )
          );

      attendanceMessage =
        await channel.send({
          embeds: [embed],
          components: [row]
        });

      panelData.attendanceMessageId =
        attendanceMessage.id;

      saveAttendancePanel(
        panelData
      );
    }

    await updateAttendancePanel(
      guild
    );

  } catch (error) {
    console.log(
      "⚠️ خطأ في إنشاء نظام الحضور:",
      error.message
    );
  }
}

// =====================================================
// إضافة Warn
// =====================================================

async function addWarn(
  guild,
  userId,
  type,
  reason,
  mainData = null
) {
  if (
    isFullyExcluded(userId)
  ) {
    return false;
  }

  const data =
    mainData || loadData();

  if (!data[userId]) {
    data[userId] = {
      name: "Unknown",
      attendance: [],
      lastAttendance: null,
      presentToday: false,
      attendanceStartedAt: null,
      playTimeByDate: {},
      totalPlayTimeSeconds: 0,
      dailyPlayTimeDate: null,
      dailyPlayTimeSeconds: 0,
      tasks: [],
      taskWarns: 0,
      absenceWarns: 0,
      totalWarns: 0,
      fines: [],
      points: 0,
      vacations: [],
      lastAbsenceCheck: null,
      lastReset: null
    };
  }

  const player =
    data[userId];

  let member;

  try {
    member =
      await guild.members.fetch(
        userId
      );
  } catch (error) {
    console.log(
      "⚠️ لم أستطع جلب العضو:",
      error.message
    );
  }

  if (
    member &&
    isFullyExcluded(member)
  ) {
    return false;
  }

  if (
    type === "task" &&
    member &&
    isTaskExcluded(member)
  ) {
    return false;
  }

  let warnNumber;
  let roleIds;

  if (
    type === "task"
  ) {
    player.taskWarns++;

    warnNumber =
      Math.min(
        player.taskWarns,
        3
      );

    roleIds =
      TASK_WARN_ROLES;

  } else {
    player.absenceWarns++;

    warnNumber =
      Math.min(
        player.absenceWarns,
        3
      );

    roleIds =
      ABSENCE_WARN_ROLES;
  }

  player.totalWarns++;

  saveData(data);

  try {
    if (!member) {
      member =
        await guild.members.fetch(
          userId
        );
    }

    if (
      isFullyExcluded(member)
    ) {
      return false;
    }

    for (
      const roleId
      of roleIds
    ) {
      if (
        member.roles.cache.has(
          roleId
        )
      ) {
        await member.roles
          .remove(roleId)
          .catch(() => {});
      }
    }

    const newRole =
      roleIds[
        warnNumber - 1
      ];

    if (newRole) {
      await member.roles
        .add(newRole)
        .catch(() => {});
    }

  } catch (error) {
    console.log(
      "⚠️ لم أستطع تعديل رتبة الـWarn:",
      error.message
    );
  }

  try {
    const channel =
      await guild.channels.fetch(
        WARN_CHANNEL_ID
      );

    if (channel) {
      const embed =
        new EmbedBuilder()
          .setTitle(
            "⚠️ تحذير جديد"
          )
          .setDescription(
            `<@${userId}>\n\n` +
            `📌 النوع: **${
              type === "task"
                ? "تاسك"
                : "غياب"
            }**\n` +
            `🔢 التحذير: **${warnNumber}/3**\n` +
            `📝 السبب: **${reason}**`
          )
          .setTimestamp();

      await channel.send({
        content:
          `<@${userId}>`,
        embeds: [embed]
      });
    }

  } catch (error) {
    console.log(
      "⚠️ لم أستطع إرسال الـWarn:",
      error.message
    );
  }

  return true;
}

// =====================================================
// أوامر السلاش
// =====================================================

const commands = [
  new SlashCommandBuilder()
    .setName("حضوراتي")
    .setDescription(
      "عرض سجل حضورك"
    ),

  new SlashCommandBuilder()
    .setName("الغيابات")
    .setDescription(
      "عرض الغائبين"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("تاسك")
    .setDescription(
      "إضافة تاسك لجميع الأعضاء"
    )
    .addStringOption(
      option =>
        option
          .setName("المهمة")
          .setDescription(
            "وصف التاسك"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("تسليم")
    .setDescription(
      "تسجيل تسليم تاسك لعضو"
    )
    .addUserOption(
      option =>
        option
          .setName("العضو")
          .setDescription(
            "العضو"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("تاسكاتي")
    .setDescription(
      "عرض التاسكات الخاصة بك"
    ),

  new SlashCommandBuilder()
    .setName("التاسكات")
    .setDescription(
      "عرض جميع التاسكات"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("غرامة")
    .setDescription(
      "إضافة غرامة لعضو"
    )
    .addUserOption(
      option =>
        option
          .setName("العضو")
          .setDescription(
            "العضو"
          )
          .setRequired(true)
    )
    .addStringOption(
      option =>
        option
          .setName("السبب")
          .setDescription(
            "سبب الغرامة"
          )
          .setRequired(true)
          .addChoices(
            {
              name:
                "عدم انصياع للأوامر — 10,000",
              value:
                "عدم انصياع للأوامر"
            },
            {
              name:
                "أشياء غير لائقة — 5,000",
              value:
                "أشياء غير لائقة"
            },
            {
              name:
                "التأخير عن مهمة — 5,000",
              value:
                "التأخير عن مهمة"
            },
            {
              name:
                "الغياب بدون إذن — 20,000",
              value:
                "الغياب بدون إذن"
            },
            {
              name:
                "مخالفة قوانين العصابة — 30,000",
              value:
                "مخالفة قوانين العصابة"
            }
          )
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("غراماتي")
    .setDescription(
      "عرض غراماتك"
    ),

  new SlashCommandBuilder()
    .setName("غرامات_العضو")
    .setDescription(
      "عرض غرامات عضو"
    )
    .addUserOption(
      option =>
        option
          .setName("العضو")
          .setDescription(
            "العضو"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("دفع_الغرامة")
    .setDescription(
      "دفع غرامة"
    )
    .addIntegerOption(
      option =>
        option
          .setName("رقم")
          .setDescription(
            "رقم الغرامة"
          )
          .setRequired(true)
          .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("تحذير")
    .setDescription(
      "إعطاء تحذير لعضو"
    )
    .addUserOption(
      option =>
        option
          .setName("العضو")
          .setDescription(
            "العضو"
          )
          .setRequired(true)
    )
    .addStringOption(
      option =>
        option
          .setName("السبب")
          .setDescription(
            "سبب التحذير"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("ترقية")
    .setDescription(
      "ترقية عضو"
    )
    .addUserOption(
      option =>
        option
          .setName("العضو")
          .setDescription(
            "العضو"
          )
          .setRequired(true)
    )
    .addRoleOption(
      option =>
        option
          .setName("الرتبة")
          .setDescription(
            "الرتبة الجديدة"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("تنزيل")
    .setDescription(
      "تنزيل رتبة عضو"
    )
    .addUserOption(
      option =>
        option
          .setName("العضو")
          .setDescription(
            "العضو"
          )
          .setRequired(true)
    )
    .addRoleOption(
      option =>
        option
          .setName("الرتبة")
          .setDescription(
            "الرتبة"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("اجازة")
    .setDescription(
      "إعطاء إجازة لعضو"
    )
    .addUserOption(
      option =>
        option
          .setName("العضو")
          .setDescription(
            "العضو"
          )
          .setRequired(true)
    )
    .addIntegerOption(
      option =>
        option
          .setName("الأيام")
          .setDescription(
            "عدد أيام الإجازة"
          )
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(30)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("انهاء_اجازة")
    .setDescription(
      "إنهاء إجازة عضو قبل موعدها"
    )
    .addUserOption(
      option =>
        option
          .setName("العضو")
          .setDescription(
            "العضو"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("نقاط")
    .setDescription(
      "عرض نقاط عضو"
    )
    .addUserOption(
      option =>
        option
          .setName("العضو")
          .setDescription(
            "العضو"
          )
          .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ترتيب")
    .setDescription(
      "عرض ترتيب الأعضاء بالنقاط"
    ),

  new SlashCommandBuilder()
    .setName("احصائيات")
    .setDescription(
      "عرض إحصائيات عضو"
    )
    .addUserOption(
      option =>
        option
          .setName("العضو")
          .setDescription(
            "العضو"
          )
          .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("تقرير")
    .setDescription(
      "عرض التقرير العام"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
].map(
  command =>
    command.toJSON()
);

// =====================================================
// تشغيل البوت
// =====================================================

client.once(
  "ready",
  async () => {

    console.log(
      "البوت شغال باسم " +
      client.user.tag
    );

    const TOKEN =
      process.env.TOKEN?.trim();

    if (!TOKEN) {
      console.error(
        "❌ TOKEN مش موجود في Environment Variables."
      );
      return;
    }

    const rest =
      new REST({
        version: "10"
      }).setToken(TOKEN);

    try {
      for (
        const guild
        of client.guilds.cache.values()
      ) {

        await rest.put(
          Routes.applicationGuildCommands(
            client.user.id,
            guild.id
          ),
          {
            body: commands
          }
        );

        console.log(
          "تم تسجيل الأوامر في: " +
          guild.name
        );

        await setupAttendancePanel(
          guild
        );
      }

    } catch (error) {
      console.error(
        "❌ خطأ في تسجيل الأوامر:",
        error
      );
    }

    await dailyCheck();

    setInterval(
      dailyCheck,
      60 * 60 * 1000
    );

    // تحديث لوحة الحضور كل دقيقة
    setInterval(
      async () => {
        const data =
          loadData();

        for (
          const guild
          of client.guilds.cache.values()
        ) {
          await updateAttendancePanel(
            guild,
            data
          );
        }
      },
      60 * 1000
    );
  }
);

// =====================================================
// التفاعلات
// =====================================================

client.on(
  "interactionCreate",
  async interaction => {

    // =================================================
    // أزرار الحضور والانصراف
    // =================================================

    if (
      interaction.isButton() &&
      (
        interaction.customId ===
          "attendance_check_in" ||
        interaction.customId ===
          "attendance_check_out"
      )
    ) {

      const data =
        loadData();

      const user =
        interaction.user;

      if (
        isFullyExcluded(user.id)
      ) {
        return interaction.reply({
          content:
            "🚫 أنت مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      const player =
        ensurePlayer(
          data,
          user
        );

      const today =
        egyptDate();

      // =================================================
      // تسجيل حضور
      // =================================================

      if (
        interaction.customId ===
        "attendance_check_in"
      ) {

        if (
          player.presentToday
        ) {
          return interaction.reply({
            content:
              "⚠️ أنت مسجل حضور بالفعل.",
            ephemeral: true
          });
        }

        player.presentToday =
          true;

        player.lastAttendance =
          today;

        player.attendanceStartedAt =
          new Date().toISOString();

        if (
          !player.attendance.includes(
            today
          )
        ) {
          player.attendance.push(
            today
          );
        }

        player.points += 1;

        saveData(data);

        await updateAttendancePanel(
          interaction.guild,
          data
        );

        return interaction.reply({
          content:
            `🟢 **تم تسجيل حضورك بنجاح!**\n` +
            `📅 التاريخ: **${today}**\n` +
            `⏱️ بدأ حساب وقت اللعب من دلوقتي.\n` +
            `⭐ +1 نقطة`,
          ephemeral: true
        });
      }

      // =================================================
      // تسجيل انصراف
      // =================================================

      if (
        interaction.customId ===
        "attendance_check_out"
      ) {

        if (
          !player.presentToday
        ) {
          return interaction.reply({
            content:
              "⚠️ أنت مش مسجل حضور حاليًا.",
            ephemeral: true
          });
        }

        const playedSeconds =
          closeAttendanceSession(
            player,
            today
          );

        saveData(data);

        await updateAttendancePanel(
          interaction.guild,
          data
        );

        return interaction.reply({
          content:
            `🔴 **تم تسجيل انصرافك بنجاح.**\n\n` +
            `⏱️ وقت لعبك في الجلسة: **${formatPlayTime(playedSeconds)}**\n` +
            `📊 إجمالي وقت لعبك اليوم: **${formatPlayTime(getCurrentDailyPlayTime(player, today))}**`,
          ephemeral: true
        });
      }

      return;
    }

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const command =
      interaction.commandName;

    const data =
      loadData();

    // =================================================
    // حضوراتي
    // =================================================

    if (
      command === "حضوراتي"
    ) {

      if (
        isFullyExcluded(
          interaction.user.id
        )
      ) {
        return interaction.reply({
          content:
            "🚫 أنت مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      const player =
        data[
          interaction.user.id
        ];

      if (
        !player ||
        !player.attendance ||
        player.attendance.length === 0
      ) {
        return interaction.reply({
          content:
            "📋 مفيش سجل حضور ليك لسه.",
          ephemeral: true
        });
      }

      const list =
        player.attendance
          .slice(-14)
          .map(
            date =>
              `📅 ${date}`
          )
          .join("\n");

      const embed =
        new EmbedBuilder()
          .setTitle(
            "📋 سجل حضورك"
          )
          .setDescription(list)
          .addFields({
            name:
              "إجمالي أيام الحضور",
            value:
              `${player.attendance.length}`,
            inline: true
          })
          .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // =================================================
    // الغيابات
    // =================================================

    if (
      command === "الغيابات"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      const members =
        await interaction.guild.members.fetch();

      const absent = [];

      for (
        const member
        of members.values()
      ) {

        if (
          member.user.bot
        ) continue;

        if (
          isFullyExcluded(member)
        ) continue;

        const player =
          data[member.id];

        if (!player)
          continue;

        if (
          !player.presentToday
        ) {
          absent.push(
            `<@${member.id}>`
          );
        }
      }

      if (
        absent.length === 0
      ) {
        return interaction.reply(
          "✅ مفيش أعضاء غائبين."
        );
      }

      return interaction.reply(
        `❌ **الغائبين اليوم:**\n\n` +
        absent.join("\n")
      );
    }

    // =================================================
    // تاسك
    // =================================================

    if (
      command === "تاسك"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      const taskText =
        interaction.options.getString(
          "المهمة"
        );

      const members =
        await interaction.guild.members.fetch();

      let added = 0;
      let excluded = 0;

      for (
        const member
        of members.values()
      ) {

        if (
          member.user.bot
        ) continue;

        if (
          isTaskExcluded(member)
        ) {
          excluded++;
          continue;
        }

        const player =
          ensurePlayer(
            data,
            member.user
          );

        const taskId =
          player.tasks.length + 1;

        player.tasks.push({
          id: taskId,
          text: taskText,
          date: egyptDate(),
          submitted: false,
          submittedAt: null,
          submittedBy: null,
          warned: false
        });

        added++;
      }

      saveData(data);

      return interaction.reply(
        `📋 **تم توزيع التاسك على الجميع**\n\n` +
        `📝 المهمة: **${taskText}**\n` +
        `👥 تم إضافة التاسك لـ **${added} عضو**\n` +
        `🚫 تم استثناء **${excluded} عضو**`
      );
    }

    // =================================================
    // تسليم
    // =================================================

    if (
      command === "تسليم"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "العضو"
        );

      let member;

      try {
        member =
          await interaction.guild.members.fetch(
            user.id
          );
      } catch {
        return interaction.reply({
          content:
            "❌ مقدرتش أوصل للعضو.",
          ephemeral: true
        });
      }

      if (
        isFullyExcluded(member)
      ) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      if (
        isTaskExcluded(member)
      ) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى من نظام التاسكات.",
          ephemeral: true
        });
      }

      const player =
        ensurePlayer(
          data,
          user
        );

      const task =
        player.tasks.find(
          task =>
            !task.submitted
        );

      if (!task) {
        return interaction.reply({
          content:
            `❌ مفيش تاسك معلق على ${user}.`,
          ephemeral: true
        });
      }

      task.submitted = true;
      task.submittedAt =
        new Date().toISOString();
      task.submittedBy =
        interaction.user.id;
      task.warned = true;

      player.points += 2;

      saveData(data);

      return interaction.reply(
        `✅ **تم تسجيل تسليم التاسك**\n\n` +
        `👤 العضو: ${user}\n` +
        `📋 التاسك: **${task.text}**\n` +
        `⭐ +2 نقاط`
      );
    }

    // =================================================
    // تاسكاتي
    // =================================================

    if (
      command === "تاسكاتي"
    ) {

      if (
        isFullyExcluded(
          interaction.user.id
        )
      ) {
        return interaction.reply({
          content:
            "🚫 أنت مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      let member;

      try {
        member =
          await interaction.guild.members.fetch(
            interaction.user.id
          );
      } catch {}

      if (
        member &&
        isTaskExcluded(member)
      ) {
        return interaction.reply({
          content:
            "🚫 أنت مستثنى من نظام التاسكات.",
          ephemeral: true
        });
      }

      const player =
        data[
          interaction.user.id
        ];

      if (
        !player ||
        !player.tasks ||
        player.tasks.length === 0
      ) {
        return interaction.reply({
          content:
            "📋 مفيش تاسكات ليك.",
          ephemeral: true
        });
      }

      const list =
        player.tasks
          .slice(-10)
          .map(
            task =>
              `${task.submitted ? "✅" : "❌"} ` +
              `**#${task.id}** — ${task.text}\n` +
              `📅 ${task.date}`
          )
          .join("\n\n");

      const embed =
        new EmbedBuilder()
          .setTitle(
            "📋 تاسكاتك"
          )
          .setDescription(list)
          .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // =================================================
    // كل التاسكات
    // =================================================

    if (
      command === "التاسكات"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      let text = "";

      for (
        const [id, player]
        of Object.entries(data)
      ) {

        if (
          isFullyExcluded(id)
        ) continue;

        if (
          !player.tasks
        ) continue;

        let member;

        try {
          member =
            await interaction.guild.members.fetch(
              id
            );
        } catch {
          continue;
        }

        if (
          isTaskExcluded(member)
        ) continue;

        const pending =
          player.tasks.filter(
            task =>
              !task.submitted
          );

        if (
          pending.length === 0
        ) continue;

        text +=
          `👤 <@${id}>\n` +
          pending
            .map(
              t =>
                `📋 #${t.id} — ${t.text}`
            )
            .join("\n") +
          "\n\n";
      }

      if (!text) {
        return interaction.reply(
          "✅ مفيش تاسكات معلقة."
        );
      }

      const embed =
        new EmbedBuilder()
          .setTitle(
            "📋 التاسكات المعلقة"
          )
          .setDescription(text)
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    // =================================================
    // غرامة
    // =================================================

    if (
      command === "غرامة"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "العضو"
        );

      if (
        isFullyExcluded(user.id)
      ) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى بالكامل من نظام البوت، ومينفعش تتحط عليه غرامة.",
          ephemeral: true
        });
      }

      const reason =
        interaction.options.getString(
          "السبب"
        );

      const amounts = {
        "عدم انصياع للأوامر": 10000,
        "أشياء غير لائقة": 5000,
        "التأخير عن مهمة": 5000,
        "الغياب بدون إذن": 20000,
        "مخالفة قوانين العصابة": 30000
      };

      const amount =
        amounts[reason];

      if (!amount) {
        return interaction.reply({
          content:
            "❌ مبلغ الغرامة غير صحيح.",
          ephemeral: true
        });
      }

      const fineRole =
        FINE_ROLES[reason];

      const player =
        ensurePlayer(
          data,
          user
        );

      const fineId =
        player.fines.length + 1;

      const createdAt =
        Date.now();

      const deadline =
        createdAt +
        FINE_DURATION;

      player.fines.push({
        id: fineId,
        reason,
        amount,
        role: fineRole,
        date: egyptDate(),
        by: interaction.user.id,
        paid: false,
        paidAt: null,
        createdAt,
        deadline
      });

      player.points -= 1;

      saveData(data);

      try {
        const member =
          await interaction.guild.members.fetch(
            user.id
          );

        if (fineRole) {
          await member.roles.add(
            fineRole
          );
        }

      } catch (error) {
        console.log(
          "⚠️ لم أستطع إضافة رول الغرامة:",
          error.message
        );
      }

      return interaction.reply(
        `💰 **تم تسجيل غرامة على ${user}**\n\n` +
        `📝 السبب: **${reason}**\n` +
        `💵 المبلغ: **${amount.toLocaleString()} جنيه**\n` +
        `🆔 رقم الغرامة: **#${fineId}**\n` +
        `⏳ مهلة السداد: **48 ساعة**\n` +
        `⭐ -1 نقطة`
      );
    }

    // =================================================
    // غراماتي
    // =================================================

    if (
      command === "غراماتي"
    ) {

      if (
        isFullyExcluded(
          interaction.user.id
        )
      ) {
        return interaction.reply({
          content:
            "🚫 أنت مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      const player =
        data[
          interaction.user.id
        ];

      if (
        !player ||
        !player.fines ||
        player.fines.length === 0
      ) {
        return interaction.reply({
          content:
            "✅ مفيش غرامات عليك.",
          ephemeral: true
        });
      }

      const now =
        Date.now();

      const list =
        player.fines
          .slice(-10)
          .map(
            (fine, index) => {

              const id =
                fine.id ||
                index + 1;

              let status;

              if (
                fine.paid === true
              ) {
                status =
                  "✅ مدفوعة";
              } else if (
                fine.deadline &&
                now >= fine.deadline
              ) {
                status =
                  "🔴 متأخرة";
              } else if (
                fine.deadline
              ) {
                const remaining =
                  fine.deadline -
                  now;

                const hours =
                  Math.ceil(
                    remaining /
                    3600000
                  );

                status =
                  `⏳ باقي ${hours} ساعة`;
              } else {
                status =
                  "⏳ غير مدفوعة";
              }

              return (
                `🆔 **#${id}**\n` +
                `💰 **${fine.amount.toLocaleString()} جنيه**\n` +
                `📝 ${fine.reason}\n` +
                `📅 ${fine.date}\n` +
                `📌 ${status}`
              );
            }
          )
          .join("\n\n");

      const unpaid =
        player.fines.filter(
          fine =>
            fine.paid !== true
        );

      const total =
        unpaid.reduce(
          (sum, fine) =>
            sum + fine.amount,
          0
        );

      const embed =
        new EmbedBuilder()
          .setTitle(
            "💰 غراماتك"
          )
          .setDescription(list)
          .addFields({
            name:
              "💵 إجمالي الغرامات غير المدفوعة",
            value:
              `${total.toLocaleString()} جنيه`
          })
          .setFooter({
            text:
              "لدفع غرامة استخدم /دفع_الغرامة"
          })
          .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // =================================================
    // دفع الغرامة
    // =================================================

    if (
      command === "دفع_الغرامة"
    ) {

      if (
        isFullyExcluded(
          interaction.user.id
        )
      ) {
        return interaction.reply({
          content:
            "🚫 أنت مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      const number =
        interaction.options.getInteger(
          "رقم"
        );

      const player =
        data[
          interaction.user.id
        ];

      if (
        !player ||
        !player.fines ||
        player.fines.length === 0
      ) {
        return interaction.reply({
          content:
            "✅ مفيش غرامات عليك.",
          ephemeral: true
        });
      }

      const fine =
        player.fines.find(
          (f, index) =>
            (
              f.id === number ||
              (
                !f.id &&
                index + 1 === number
              )
            ) &&
            f.paid !== true
        );

      if (!fine) {
        return interaction.reply({
          content:
            "❌ الغرامة دي مش موجودة أو اتدفعت بالفعل.",
          ephemeral: true
        });
      }

      fine.paid = true;

      fine.paidAt =
        Date.now();

      saveData(data);

      try {
        const member =
          await interaction.guild.members.fetch(
            interaction.user.id
          );

        const fineRole =
          fine.role ||
          FINE_ROLES[
            fine.reason
          ];

        const hasAnotherFine =
          player.fines.some(
            f =>
              f !== fine &&
              f.paid !== true &&
              (
                f.role ||
                FINE_ROLES[
                  f.reason
                ]
              ) === fineRole
          );

        if (
          fineRole &&
          !hasAnotherFine &&
          member.roles.cache.has(
            fineRole
          )
        ) {
          await member.roles.remove(
            fineRole
          );
        }

      } catch (error) {
        console.log(
          "⚠️ لم أستطع إزالة رول الغرامة:",
          error.message
        );
      }

      return interaction.reply(
        `✅ **تم دفع الغرامة #${fine.id} بنجاح**\n\n` +
        `💵 المبلغ: **${fine.amount.toLocaleString()} جنيه**\n` +
        `📝 السبب: **${fine.reason}**\n` +
        `💳 الحالة: **مدفوعة**`
      );
    }

    // =================================================
    // غرامات العضو
    // =================================================

    if (
      command === "غرامات_العضو"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "العضو"
        );

      const player =
        data[user.id];

      if (
        !player ||
        !player.fines ||
        player.fines.length === 0
      ) {
        return interaction.reply(
          `✅ ${user} مفيش عليه غرامات.`
        );
      }

      const now =
        Date.now();

      const total =
        player.fines
          .filter(
            fine =>
              fine.paid !== true
          )
          .reduce(
            (sum, fine) =>
              sum + fine.amount,
            0
          );

      const list =
        player.fines
          .map(
            (fine, index) => {

              const id =
                fine.id ||
                index + 1;

              let status;

              if (
                fine.paid === true
              ) {
                status =
                  "✅ مدفوعة";
              } else if (
                fine.deadline &&
                now >= fine.deadline
              ) {
                status =
                  "🔴 متأخرة";
              } else {
                status =
                  "⏳ غير مدفوعة";
              }

              return (
                `🆔 #${id} — ` +
                `💰 ${fine.amount.toLocaleString()} جنيه\n` +
                `📝 ${fine.reason}\n` +
                `📅 ${fine.date} — ${status}`
              );
            }
          )
          .join("\n\n");

      return interaction.reply(
        `💰 **غرامات ${user}**\n\n` +
        `${list}\n\n` +
        `💵 **المتبقي غير المدفوع: ${total.toLocaleString()} جنيه**`
      );
    }

    // =================================================
    // تحذير يدوي
    // =================================================

    if (
      command === "تحذير"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "العضو"
        );

      if (
        isFullyExcluded(user.id)
      ) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى بالكامل من نظام البوت، ومينفعش ياخد Warn.",
          ephemeral: true
        });
      }

      const reason =
        interaction.options.getString(
          "السبب"
        );

      const result =
        await addWarn(
          interaction.guild,
          user.id,
          "absence",
          reason,
          data
        );

      if (!result) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى من الـWarn.",
          ephemeral: true
        });
      }

      return interaction.reply(
        `⚠️ تم إعطاء Warn لـ ${user}\n` +
        `📝 السبب: **${reason}**`
      );
    }

    // =================================================
    // ترقية
    // =================================================

    if (
      command === "ترقية"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "العضو"
        );

      if (
        isFullyExcluded(user.id)
      ) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      const role =
        interaction.options.getRole(
          "الرتبة"
        );

      const member =
        await interaction.guild.members.fetch(
          user.id
        );

      try {
        await member.roles.add(
          role.id
        );
      } catch {
        return interaction.reply({
          content:
            "❌ مقدرتش أضيف الرتبة. تأكد إن رتبة البوت أعلى منها.",
          ephemeral: true
        });
      }

      return interaction.reply(
        `🏅 تم ترقية ${user} إلى **${role.name}**`
      );
    }

    // =================================================
    // تنزيل
    // =================================================

    if (
      command === "تنزيل"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "العضو"
        );

      if (
        isFullyExcluded(user.id)
      ) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      const role =
        interaction.options.getRole(
          "الرتبة"
        );

      const member =
        await interaction.guild.members.fetch(
          user.id
        );

      try {
        await member.roles.add(
          role.id
        );
      } catch {
        return interaction.reply({
          content:
            "❌ مقدرتش أغير الرتبة.",
          ephemeral: true
        });
      }

      return interaction.reply(
        `📉 تم تنزيل ${user} إلى **${role.name}**`
      );
    }

    // =================================================
    // إجازة
    // =================================================

    if (
      command === "اجازة"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "العضو"
        );

      if (
        isFullyExcluded(user.id)
      ) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      const days =
        interaction.options.getInteger(
          "الأيام"
        );

      const player =
        ensurePlayer(
          data,
          user
        );

      const start =
        new Date();

      const end =
        new Date(
          start.getTime() +
          days * 86400000
        );

      player.vacations.push({
        start:
          egyptDate(start),
        end:
          egyptDate(end),
        days,
        ended: false,
        endedAt: null,
        endedBy: null
      });

      saveData(data);

      return interaction.reply(
        `🌴 تم إعطاء ${user} إجازة لمدة **${days} يوم**.\n` +
        `📅 من: **${egyptDate(start)}**\n` +
        `📅 إلى: **${egyptDate(end)}**`
      );
    }

    // =================================================
    // إنهاء الإجازة قبل موعدها
    // =================================================

    if (
      command === "انهاء_اجازة"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "العضو"
        );

      if (
        isFullyExcluded(user.id)
      ) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      const player =
        data[user.id];

      if (
        !player ||
        !player.vacations ||
        player.vacations.length === 0
      ) {
        return interaction.reply({
          content:
            `❌ ${user} مفيش له إجازة مسجلة.`,
          ephemeral: true
        });
      }

      const today =
        egyptDate();

      const current =
        new Date(
          `${today}T00:00:00+03:00`
        );

      let vacationIndex = -1;

      // الإجازة الحالية أو القادمة
      for (
        let i =
          player.vacations.length - 1;
        i >= 0;
        i--
      ) {
        const vacation =
          player.vacations[i];

        if (
          vacation.ended === true
        ) {
          continue;
        }

        const start =
          new Date(
            `${vacation.start}T00:00:00+03:00`
          );

        const end =
          new Date(
            `${vacation.end}T00:00:00+03:00`
          );

        if (
          current <= end
        ) {
          vacationIndex = i;
          break;
        }
      }

      if (
        vacationIndex === -1
      ) {
        return interaction.reply({
          content:
            `❌ ${user} مفيش إجازة حالية أو قادمة يمكن إنهاؤها.`,
          ephemeral: true
        });
      }

      const vacation =
        player.vacations[
          vacationIndex
        ];

      vacation.ended =
        true;

      vacation.endedAt =
        new Date().toISOString();

      vacation.endedBy =
        interaction.user.id;

      saveData(data);

      return interaction.reply(
        `✅ **تم إنهاء إجازة ${user} بنجاح.**\n\n` +
        `📅 بداية الإجازة: **${vacation.start}**\n` +
        `📅 كانت هتنتهي: **${vacation.end}**\n` +
        `🛑 تم إنهاؤها بواسطة: ${interaction.user}`
      );
    }

    // =================================================
    // نقاط
    // =================================================

    if (
      command === "نقاط"
    ) {

      const user =
        interaction.options.getUser(
          "العضو"
        ) ||
        interaction.user;

      if (
        isFullyExcluded(user.id)
      ) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      const player =
        data[user.id];

      const points =
        player
          ? player.points || 0
          : 0;

      const today =
        egyptDate();

      const todayTime =
        player
          ? getCurrentDailyPlayTime(
              player,
              today
            )
          : 0;

      const totalTime =
        player
          ? getTotalPlayTime(
              player
            )
          : 0;

      const embed =
        new EmbedBuilder()
          .setTitle(
            `⭐ نقاط ${user.username}`
          )
          .addFields(
            {
              name:
                "⭐ النقاط",
              value:
                `${points}`,
              inline: true
            },
            {
              name:
                "⏱️ وقت اللعب اليوم",
              value:
                formatPlayTime(
                  todayTime
                ),
              inline: true
            },
            {
              name:
                "🕐 إجمالي وقت اللعب",
              value:
                formatPlayTime(
                  totalTime
                ),
              inline: true
            }
          )
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    // =================================================
    // ترتيب
    // =================================================

    if (
      command === "ترتيب"
    ) {

      const players =
        Object.entries(data)
          .filter(
            ([id]) =>
              !isFullyExcluded(id)
          )
          .sort(
            (a, b) => {

              const pointsA =
                Number(
                  a[1].points || 0
                );

              const pointsB =
                Number(
                  b[1].points || 0
                );

              // الأولوية للنقاط
              if (
                pointsB !== pointsA
              ) {
                return (
                  pointsB -
                  pointsA
                );
              }

              // لو النقاط متساوية
              // الأولوية لوقت اللعب
              const timeA =
                getTotalPlayTime(
                  a[1]
                );

              const timeB =
                getTotalPlayTime(
                  b[1]
                );

              return (
                timeB -
                timeA
              );
            }
          );

      if (
        players.length === 0
      ) {
        return interaction.reply(
          "📊 مفيش بيانات لسه."
        );
      }

      const text =
        players
          .slice(0, 10)
          .map(
            ([id, player], index) => {

              const time =
                getTotalPlayTime(
                  player
                );

              return (
                `${index + 1}. <@${id}> — ` +
                `⭐ **${player.points || 0}** ` +
                `⏱️ **${formatPlayTime(time)}**`
              );
            }
          )
          .join("\n");

      const embed =
        new EmbedBuilder()
          .setTitle(
            "🏆 ترتيب الأعضاء"
          )
          .setDescription(
            text
          )
          .setFooter({
            text:
              "الترتيب بالنقاط أولًا، وعند التعادل وقت اللعب الأعلى"
          })
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    // =================================================
    // الإحصائيات
    // =================================================

    if (
      command === "احصائيات"
    ) {

      const user =
        interaction.options.getUser(
          "العضو"
        ) ||
        interaction.user;

      if (
        isFullyExcluded(user.id)
      ) {
        return interaction.reply({
          content:
            "🚫 العضو ده مستثنى بالكامل من نظام البوت.",
          ephemeral: true
        });
      }

      const player =
        data[user.id];

      if (!player) {
        return interaction.reply(
          "❌ مفيش بيانات للعضو."
        );
      }

      const completedTasks =
        (player.tasks || [])
          .filter(
            task =>
              task.submitted
          )
          .length;

      const pendingTasks =
        (player.tasks || [])
          .filter(
            task =>
              !task.submitted
          )
          .length;

      const totalFines =
        (player.fines || [])
          .filter(
            fine =>
              fine.paid !== true
          )
          .reduce(
            (sum, fine) =>
              sum + fine.amount,
            0
          );

      const today =
        egyptDate();

      const todayPlayTime =
        getCurrentDailyPlayTime(
          player,
          today
        );

      const totalPlayTime =
        getTotalPlayTime(
          player
        );

      const embed =
        new EmbedBuilder()
          .setTitle(
            `📊 إحصائيات ${user.username}`
          )
          .addFields(
            {
              name:
                "👥 الحضور",
              value:
                `${player.attendance.length} يوم`,
              inline: true
            },
            {
              name:
                "⏱️ وقت اللعب اليوم",
              value:
                formatPlayTime(
                  todayPlayTime
                ),
              inline: true
            },
            {
              name:
                "🕐 إجمالي وقت اللعب",
              value:
                formatPlayTime(
                  totalPlayTime
                ),
              inline: true
            },
            {
              name:
                "📋 التاسكات المسلمة",
              value:
                `${completedTasks}`,
              inline: true
            },
            {
              name:
                "📋 التاسكات المعلقة",
              value:
                `${pendingTasks}`,
              inline: true
            },
            {
              name:
                "⚠️ Warn التاسكات",
              value:
                `${player.taskWarns}`,
              inline: true
            },
            {
              name:
                "⚠️ Warn الغياب",
              value:
                `${player.absenceWarns}`,
              inline: true
            },
            {
              name:
                "💰 الغرامات",
              value:
                `${totalFines.toLocaleString()} جنيه`,
              inline: true
            },
            {
              name:
                "⭐ النقاط",
              value:
                `${player.points}`,
              inline: true
            }
          )
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    // =================================================
    // التقرير
    // =================================================

    if (
      command === "تقرير"
    ) {

      if (
        !isAdmin(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ الأمر ده للإدارة فقط.",
          ephemeral: true
        });
      }

      let attendance = 0;
      let tasks = 0;
      let pending = 0;
      let fines = 0;
      let warns = 0;

      for (
        const [userId, player]
        of Object.entries(data)
      ) {

        if (
          isFullyExcluded(userId)
        ) continue;

        if (
          player.presentToday
        ) {
          attendance++;
        }

        try {
          const member =
            await interaction.guild.members.fetch(
              userId
            );

          if (
            !isTaskExcluded(member)
          ) {

            for (
              const task
              of player.tasks || []
            ) {

              if (
                task.submitted
              ) {
                tasks++;
              } else {
                pending++;
              }
            }
          }

        } catch {}

        for (
          const fine
          of player.fines || []
        ) {

          if (
            fine.paid !== true
          ) {
            fines +=
              fine.amount;
          }
        }

        warns +=
          player.totalWarns || 0;
      }

      const embed =
        new EmbedBuilder()
          .setTitle(
            "📋 التقرير العام"
          )
          .addFields(
            {
              name:
                "🟢 الحضور اليوم",
              value:
                `${attendance}`,
              inline: true
            },
            {
              name:
                "✅ التاسكات المسلمة",
              value:
                `${tasks}`,
              inline: true
            },
            {
              name:
                "❌ التاسكات المعلقة",
              value:
                `${pending}`,
              inline: true
            },
            {
              name:
                "⚠️ إجمالي التحذيرات",
              value:
                `${warns}`,
              inline: true
            },
            {
              name:
                "💰 الغرامات غير المدفوعة",
              value:
                `${fines.toLocaleString()} جنيه`,
              inline: true
            }
          )
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }
  }
);

// =====================================================
// الفحص اليومي
// =====================================================

async function dailyCheck() {

  const data =
    loadData();

  const now =
    new Date();

  const today =
    egyptDate(now);

  const currentEgyptHour =
    egyptHour(now);

  // ===================================================
  // التعامل مع الجلسات المفتوحة
  // ===================================================

  for (
    const [userId, player]
    of Object.entries(data)
  ) {

    if (
      isFullyExcluded(userId)
    ) continue;

    if (
      !player.presentToday ||
      !player.attendanceStartedAt
    ) {
      continue;
    }

    const startedDate =
      egyptDate(
        new Date(
          player.attendanceStartedAt
        )
      );

    // لو الجلسة بدأت في يوم قديم
    // نقفلها عند تغيير اليوم
    if (
      startedDate !== today
    ) {

      const startedTime =
        new Date(
          player.attendanceStartedAt
        ).getTime();

      const midnight =
        new Date(
          `${today}T00:00:00+03:00`
        ).getTime();

      if (
        !Number.isNaN(
          startedTime
        )
      ) {

        const seconds =
          Math.max(
            0,
            Math.floor(
              (
                midnight -
                startedTime
              ) / 1000
            )
          );

        addPlayTime(
          player,
          startedDate,
          seconds
        );
      }

      // يبدأ جلسة جديدة لليوم الجديد
      player.attendanceStartedAt =
        new Date().toISOString();

      player.presentToday =
        true;

      player.lastAttendance =
        today;

      if (
        !player.attendance.includes(
          today
        )
      ) {
        player.attendance.push(
          today
        );
      }
    }
  }

  for (
    const guild
    of client.guilds.cache.values()
  ) {

    let members;

    try {
      members =
        await guild.members.fetch();
    } catch {
      continue;
    }

    for (
      const member
      of members.values()
    ) {

      if (
        member.user.bot
      ) continue;

      if (
        isFullyExcluded(member)
      ) continue;

      const player =
        data[member.id];

      if (!player)
        continue;

      // =================================================
      // الإجازة
      // =================================================

      let onVacation = false;

      for (
        const vacation
        of player.vacations || []
      ) {

        // الإجازة المنتهية يدويًا لا تتحسب
        if (
          vacation.ended === true
        ) {
          continue;
        }

        const current =
          new Date(
            `${today}T00:00:00+03:00`
          );

        const start =
          new Date(
            `${vacation.start}T00:00:00+03:00`
          );

        const end =
          new Date(
            `${vacation.end}T00:00:00+03:00`
          );

        if (
          current >= start &&
          current <= end
        ) {
          onVacation = true;
          break;
        }
      }

      if (
        onVacation
      ) continue;

      // =================================================
      // الغياب
      // =================================================

      if (
        player.lastAttendance &&
        player.lastAbsenceCheck !== today
      ) {

        const difference =
          daysBetween(
            player.lastAttendance,
            today
          );

        if (
          difference >= 2
        ) {

          await addWarn(
            guild,
            member.id,
            "absence",
            "الغياب يومين متتاليين",
            data
          );

          player.lastAbsenceCheck =
            today;
        }
      }

      // =================================================
      // استثناء التاسكات
      // =================================================

      if (
        isTaskExcluded(member)
      ) continue;

      // =================================================
      // التاسكات + مهلة 4 ساعات
      // =================================================

      if (
        currentEgyptHour >= 4
      ) {

        for (
          const task
          of player.tasks || []
        ) {

          if (
            task.submitted ||
            task.warned
          ) {
            continue;
          }

          if (
            task.date !== today
          ) {

            task.warned =
              true;

            await addWarn(
              guild,
              member.id,
              "task",
              `عدم تسليم التاسك #${task.id}: ${task.text}`,
              data
            );
          }
        }
      }
    }
  }

  // ===================================================
  // تحديث بيانات الوقت اليومية
  // ===================================================

  for (
    const [userId, player]
    of Object.entries(data)
  ) {

    if (
      isFullyExcluded(userId)
    ) continue;

    const todayTime =
      getCurrentDailyPlayTime(
        player,
        today
      );

    player.dailyPlayTimeDate =
      today;

    player.dailyPlayTimeSeconds =
      getSavedDailyPlayTime(
        player,
        today
      );

    // لو العضو موجود حاليًا، ما نضيفش الوقت
    // للإجمالي هنا لأن الجلسة لسه مفتوحة.
    // الوقت بيتحسب مباشرة عند الانصراف.
    if (
      !player.presentToday
    ) {
      player.dailyPlayTimeSeconds =
        todayTime;
    }
  }

  saveData(data);

  // ===================================================
  // تحديث لوحة الحضور
  // ===================================================

  for (
    const guild
    of client.guilds.cache.values()
  ) {

    await updateAttendancePanel(
      guild,
      data
    );
  }

  console.log(
    `🔄 تم فحص النظام — ${today} — الساعة ${currentEgyptHour}:00 بتوقيت مصر`
  );
}

// =====================================================
// تشغيل البوت
// =====================================================

const TOKEN =
  process.env.TOKEN?.trim();

if (!TOKEN) {
  console.error(
    "❌ TOKEN مش موجود في Environment Variables."
  );
} else {
  client.login(TOKEN).catch(
    error => {
      console.error(
        "❌ فشل تسجيل دخول البوت."
      );

      if (
        error?.code ===
        "TokenInvalid"
      ) {
        console.error(
          "❌ الـ TOKEN غير صحيح. حط Bot Token الصحيح في TOKEN داخل Environment Variables."
        );
      } else {
        console.error(
          error
        );
      }
    }
  );
}

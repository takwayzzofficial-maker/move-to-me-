/**
 * MoveToMe — Revenge/Vendetta plugin
 *
 * Добавляет иконку-стрелочку рядом с именем участника в списке участников
 * голосового канала. Нажатие пытается переместить (move) этого участника
 * в тот голосовой канал, где сейчас находишься ты.
 *
 * Работает через REST-запрос PATCH /guilds/{guild_id}/members/{user_id}
 * с телом { channel_id }. Это тот же запрос, который Discord отправляет,
 * когда модератор перетаскивает юзера между войс-каналами вручную.
 * Если у тебя нет права MOVE_MEMBERS на сервере, Discord API вернёт 403 —
 * плагин это не обходит (обойти права сервера через клиент невозможно).
 */

import { findByProps, findByStoreName } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";

const { TouchableOpacity, Image, View } = ReactNative;

// Stores
const VoiceStateStore = findByStoreName("VoiceStateStore");
const SelectedChannelStore = findByStoreName("SelectedChannelStore");
const SelectedGuildStore = findByStoreName("SelectedGuildStore");

// REST module (используется для отправки PATCH запроса на перемещение)
const RestAPI = findByProps("getAPIBaseURL", "get", "patch");

// Компонент строки участника в списке голосового канала
// (VoiceUser / VoiceStateRow — имя внутреннего модуля может отличаться
// между версиями Discord, поэтому ищем по характерному набору пропсов)
const VoiceUserRow = findByProps("renderAvatar", "renderName") // fallback ниже
  ?? findByProps("default")?.default;

let unpatch;

function moveUserToMyChannel(targetUserId) {
  try {
    const myChannelId = SelectedChannelStore.getVoiceChannelId?.() ?? SelectedChannelStore.getChannelId?.();
    const guildId = SelectedGuildStore.getGuildId?.();

    if (!myChannelId) {
      showToast("Ты не в голосовом канале", getAssetIDByName("ic_close_16px"));
      return;
    }
    if (!guildId) {
      showToast("Это работает только на сервере (гильдии)", getAssetIDByName("ic_close_16px"));
      return;
    }

    RestAPI.patch({
      url: `/guilds/${guildId}/members/${targetUserId}`,
      body: { channel_id: myChannelId },
    })
      .then(() => {
        showToast("Пользователь перемещён", getAssetIDByName("ic_check_circle"));
      })
      .catch((err) => {
        console.log("[MoveToMe] Ошибка перемещения:", err);
        showToast("Не удалось переместить (нет прав?)", getAssetIDByName("ic_close_16px"));
      });
  } catch (e) {
    console.log("[MoveToMe] Exception:", e);
    showToast("Ошибка MoveToMe плагина", getAssetIDByName("ic_close_16px"));
  }
}

function ArrowButton({ userId }) {
  return React.createElement(
    TouchableOpacity,
    {
      onPress: () => moveUserToMyChannel(userId),
      style: { paddingHorizontal: 8, justifyContent: "center", alignItems: "center" },
    },
    React.createElement(Image, {
      source: getAssetIDByName("ic_call_pull") ?? getAssetIDByName("ic_message_forward"),
      style: { width: 20, height: 20, tintColor: "#ffffff" },
    })
  );
}

export const onLoad = () => {
  if (!VoiceUserRow) {
    showToast("MoveToMe: не найден компонент списка участников войса. Обратись к автору.");
    return;
  }

  unpatch = before("default", VoiceUserRow, (args) => {
    const props = args[0];
    const userId = props?.user?.id ?? props?.userId;
    if (!userId) return;

    // Не показываем стрелку рядом с самим собой
    const myId = findByProps("getCurrentUser")?.getCurrentUser?.()?.id;
    if (userId === myId) return;

    const originalRenderName = props.renderName;
    props.renderName = (...renderArgs) => {
      const original = originalRenderName?.(...renderArgs);
      return React.createElement(
        View,
        { style: { flexDirection: "row", alignItems: "center" } },
        original,
        React.createElement(ArrowButton, { userId })
      );
    };
  });
};

export const onUnload = () => {
  unpatch?.();
};

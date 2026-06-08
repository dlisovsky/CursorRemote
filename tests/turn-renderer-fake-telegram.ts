import type { TelegramApiClient, TgKeyboard } from '../src/server/transports/telegram/tg-types.js';

export interface RecordedCall {
  kind: 'send' | 'edit' | 'delete' | 'answerCb';
  chatId?: number;
  messageId?: number;
  threadId?: number;
  text?: string;
  keyboard?: TgKeyboard;
  replyTo?: number;
}

/**
 * In-memory Telegram Bot API used by the headless QA layer (T1). Records an
 * ordered call log so tests assert the exact send/edit sequence.
 */
export class FakeTelegram implements TelegramApiClient {
  calls: RecordedCall[] = [];
  private nextId = 1000;

  async sendMessage(
    chatId: number,
    text: string,
    options?: { message_thread_id?: number; parse_mode?: string; reply_markup?: TgKeyboard; reply_to_message_id?: number },
  ): Promise<{ message_id: number }> {
    const message_id = this.nextId++;
    this.calls.push({
      kind: 'send', chatId, messageId: message_id, threadId: options?.message_thread_id,
      text, keyboard: options?.reply_markup, replyTo: options?.reply_to_message_id,
    });
    return { message_id };
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options?: { parse_mode?: string; reply_markup?: TgKeyboard; message_thread_id?: number },
  ): Promise<void> {
    this.calls.push({ kind: 'edit', chatId, messageId, text, keyboard: options?.reply_markup });
  }

  async deleteMessage(chatId: number, messageId: number): Promise<boolean> {
    this.calls.push({ kind: 'delete', chatId, messageId });
    return true;
  }

  async sendChatAction(): Promise<void> { /* noop */ }
  async createForumTopic(): Promise<{ message_thread_id: number }> { return { message_thread_id: 1 }; }
  async editForumTopic(): Promise<void> { /* noop */ }
  async deleteForumTopic(): Promise<void> { /* noop */ }
  async setMyCommands(): Promise<void> { /* noop */ }
  async getMe(): Promise<{ id: number; username?: string; is_bot: boolean; first_name: string }> {
    return { id: 1, is_bot: true, first_name: 'bot' };
  }
  async getChatMember(): Promise<{ status: string }> { return { status: 'administrator' }; }
  async answerCallbackQuery(_id: string, options?: { text?: string }): Promise<void> {
    this.calls.push({ kind: 'answerCb', text: options?.text });
  }
  async getFile(): Promise<{ file_path: string }> { return { file_path: 'x' }; }

  edits(): RecordedCall[] { return this.calls.filter(c => c.kind === 'edit'); }
  sends(): RecordedCall[] { return this.calls.filter(c => c.kind === 'send'); }
}

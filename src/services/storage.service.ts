import fs from 'fs';
import path from 'path';
import User from '../models/user.model';
import { Types } from 'mongoose';

// Максимальный размер хранилища для одного пользователя (10 МБ)
export const MAX_STORAGE_PER_USER = 10 * 1024 * 1024; // 10 MB in bytes

class StorageService {
  /**
   * Проверяет, превысит ли новый файл лимит хранилища пользователя
   * @param userId ID пользователя
   * @param fileSize Размер нового файла в байтах
   * @returns true если лимит не будет превышен, иначе false
   */
  async checkStorageLimit(userId: string | Types.ObjectId, fileSize: number): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Проверяем, не превысит ли лимит с учетом нового файла
      return (user.storageUsed + fileSize) <= MAX_STORAGE_PER_USER;
    } catch (error) {
      console.error('Error checking storage limit:', error);
      throw error;
    }
  }

  /**
   * Обновляет использованное пространство хранилища пользователя
   * @param userId ID пользователя
   * @param fileSize Размер файла в байтах (положительный - добавление, отрицательный - удаление)
   */
  async updateStorageUsed(userId: string | Types.ObjectId, fileSize: number): Promise<void> {
    try {
      await User.findByIdAndUpdate(userId, {
        $inc: { storageUsed: fileSize }
      });
    } catch (error) {
      console.error('Error updating storage used:', error);
      throw error;
    }
  }

  /**
   * Получает информацию о хранилище пользователя
   * @param userId ID пользователя
   * @returns Объект с информацией о хранилище
   */
  async getStorageInfo(userId: string | Types.ObjectId): Promise<{ used: number; total: number; percentage: number }> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      return {
        used: user.storageUsed,
        total: MAX_STORAGE_PER_USER,
        percentage: (user.storageUsed / MAX_STORAGE_PER_USER) * 100
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      throw error;
    }
  }

  /**
   * Удаляет файл с диска и обновляет использованное пространство пользователя
   * @param userId ID пользователя
   * @param filePath Путь к файлу
   */
  async deleteFile(userId: string | Types.ObjectId, filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        // Получаем размер файла перед удалением
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;

        // Удаляем файл
        fs.unlinkSync(filePath);

        // Уменьшаем используемое пространство
        await this.updateStorageUsed(userId, -fileSize);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }
}

export default new StorageService(); 
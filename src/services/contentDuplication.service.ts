import logger from '../utils/logger';

interface ContentSimilarityResult {
  isSimilar: boolean;
  similarity: number;
  reason?: string;
}

class ContentDuplicationService {
  private readonly SIMILARITY_THRESHOLD = 0.7; // 70% схожести считается дубликатом
  private readonly MIN_WORDS_TO_CHECK = 10; // Минимум слов для проверки

  /**
   * Проверяет, является ли новый контент дубликатом предыдущих постов
   */
  async checkContentDuplication(
    newContent: string,
    contentHistory: string[],
    threshold: number = this.SIMILARITY_THRESHOLD
  ): Promise<ContentSimilarityResult> {
    try {
      if (!newContent || newContent.trim().length === 0) {
        return { isSimilar: false, similarity: 0, reason: 'Empty content' };
      }

      if (!contentHistory || contentHistory.length === 0) {
        return { isSimilar: false, similarity: 0, reason: 'No history to compare' };
      }

      const newContentWords = this.extractKeywords(newContent);
      
      if (newContentWords.length < this.MIN_WORDS_TO_CHECK) {
        return { isSimilar: false, similarity: 0, reason: 'Content too short for comparison' };
      }

      let maxSimilarity = 0;
      let mostSimilarContent = '';

      for (const historicalContent of contentHistory) {
        const similarity = this.calculateSimilarity(newContentWords, this.extractKeywords(historicalContent));
        
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mostSimilarContent = historicalContent;
        }
      }

      const isSimilar = maxSimilarity >= threshold;

      logger.info('ContentDuplicationService: Content similarity check', {
        similarity: maxSimilarity,
        threshold,
        isSimilar,
        newContentPreview: newContent.substring(0, 100),
        mostSimilarContentPreview: mostSimilarContent.substring(0, 100)
      });

      return {
        isSimilar,
        similarity: maxSimilarity,
        reason: isSimilar ? `Too similar to previous content (${Math.round(maxSimilarity * 100)}%)` : undefined
      };
    } catch (error) {
      logger.error('ContentDuplicationService: Error checking content duplication', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // В случае ошибки, не блокируем публикацию
      return { isSimilar: false, similarity: 0, reason: 'Error during comparison' };
    }
  }

  /**
   * Создает краткое резюме контента для хранения в истории
   */
  createContentSummary(content: string): string {
    try {
      // Извлекаем ключевые слова и создаем краткое резюме
      const keywords = this.extractKeywords(content);
      const summary = keywords.slice(0, 20).join(' '); // Первые 20 ключевых слов
      
      return summary.length > 200 ? summary.substring(0, 200) : summary;
    } catch (error) {
      logger.error('ContentDuplicationService: Error creating content summary', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fallback: используем первые 200 символов
      return content.substring(0, 200);
    }
  }

  /**
   * Очищает историю контента, оставляя только записи за последние N дней
   */
  cleanContentHistory(contentHistory: string[], daysToKeep: number): string[] {
    try {
      // Для упрощения, оставляем только последние N записей
      // В реальной реализации можно было бы хранить даты и фильтровать по ним
      const maxEntries = Math.max(daysToKeep * 2, 10); // Примерно 2 поста в день максимум
      
      if (contentHistory.length <= maxEntries) {
        return contentHistory;
      }
      
      return contentHistory.slice(-maxEntries);
    } catch (error) {
      logger.error('ContentDuplicationService: Error cleaning content history', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return contentHistory;
    }
  }

  /**
   * Генерирует альтернативный промпт для избежания дубликатов
   */
  generateAntiDuplicationPrompt(originalPrompt: string, similarContent: string): string {
    const antiDuplicationInstructions = `

IMPORTANT - AVOID DUPLICATION:
The following content was recently posted and should NOT be repeated:
"${similarContent.substring(0, 200)}..."

Please create content that:
- Covers DIFFERENT aspects of the topic
- Uses DIFFERENT angles or perspectives
- Focuses on NEW information or developments
- Has a DIFFERENT tone or style
- Avoids repeating the same key points or phrases

`;

    return originalPrompt + antiDuplicationInstructions;
  }

  /**
   * Извлекает ключевые слова из текста
   */
  private extractKeywords(text: string): string[] {
    try {
      // Простая обработка текста - удаляем знаки препинания, эмодзи и разбиваем на слова
      const cleaned = text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Удаляем знаки препинания
        .replace(/\s+/g, ' ') // Убираем лишние пробелы
        .trim();

      const words = cleaned.split(' ').filter(word => {
        // Фильтруем слишком короткие слова и стоп-слова
        return word.length > 3 && !this.isStopWord(word);
      });

      // Удаляем дубликаты
      return [...new Set(words)];
    } catch (error) {
      logger.error('ContentDuplicationService: Error extracting keywords', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return [];
    }
  }

  /**
   * Вычисляет схожесть между двумя наборами ключевых слов
   */
  private calculateSimilarity(words1: string[], words2: string[]): number {
    try {
      if (words1.length === 0 || words2.length === 0) {
        return 0;
      }

      const set1 = new Set(words1);
      const set2 = new Set(words2);
      
      // Пересечение
      const intersection = new Set([...set1].filter(word => set2.has(word)));
      
      // Объединение
      const union = new Set([...set1, ...set2]);
      
      // Коэффициент Жаккара
      return intersection.size / union.size;
    } catch (error) {
      logger.error('ContentDuplicationService: Error calculating similarity', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return 0;
    }
  }

  /**
   * Проверяет, является ли слово стоп-словом
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'can', 'may', 'might', 'must', 'shall', 'his', 'her', 'its', 'their', 'our', 'your',
      'что', 'как', 'это', 'для', 'при', 'или', 'так', 'уже', 'все', 'еще', 'его', 'они'
    ]);
    
    return stopWords.has(word);
  }
}

export default new ContentDuplicationService(); 
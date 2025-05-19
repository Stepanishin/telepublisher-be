import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import User from '../models/user.model';
import mongoose from 'mongoose';

// Convert callback-based fs functions to Promise-based
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const readFile = promisify(fs.readFile);

// Path to the uploads folder
const uploadsDir = path.join(__dirname, '../../uploads');
const metadataDir = path.join(uploadsDir, '.metadata');
const draftsDir = path.join(uploadsDir, 'drafts');

// Calculate the cutoff date (7 days ago)
const getExpirationDate = (): Date => {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date;
};

/**
 * Gets the creation date of an image using its timestamp file if available,
 * otherwise falls back to the file's mtime
 * @param filename The image filename
 * @param fileStat The file's stat object containing mtime
 * @returns The creation date of the file
 */
const getImageCreationDate = async (filename: string, fileStat: fs.Stats): Promise<Date> => {
  try {
    // Check if we have a timestamp file for this image
    const timestampPath = path.join(metadataDir, `${filename}.meta`);
    if (fs.existsSync(timestampPath)) {
      const timestamp = await readFile(timestampPath, 'utf8');
      const creationDate = new Date(timestamp);
      return creationDate;
    }
  } catch (error) {
    console.error(`Error reading timestamp for ${filename}, falling back to mtime:`, error);
  }
  
  // Fall back to file modification time if no timestamp or error
  return fileStat.mtime;
};

/**
 * Check if a file is a draft image or related to drafts
 * @param filePath The full path to the file
 * @returns True if the file is related to drafts
 */
const isDraftImage = (filePath: string): boolean => {
  // Check if the path contains /drafts/ directory
  return filePath.includes('/drafts/') || filePath.includes('\\drafts\\');
};

/**
 * Проверяет, используется ли изображение в черновиках любых пользователей
 * @param filename Имя файла для проверки
 * @returns true если файл используется хотя бы в одном черновике
 */
const isImageUsedInDrafts = async (filename: string): Promise<boolean> => {
  try {
    // Проверка соединения с базой данных
    if (mongoose.connection.readyState !== 1) {
      console.error('Cannot check drafts: Database connection not established');
      return true; // Для безопасности возвращаем true, чтобы не удалять файл
    }

    // Шаблоны URL, которые могут содержать этот файл
    const possibleUrls = [
      `/uploads/${filename}`,
      `uploads/${filename}`,
      `/uploads/drafts/${filename}`,
      `uploads/drafts/${filename}`
    ];

    // Ищем пользователей, у которых в черновиках используется это изображение
    const usersWithImageInDrafts = await User.find({
      $or: [
        { 'drafts.imageUrl': { $in: possibleUrls } },
        { 'drafts.imageUrls': { $in: possibleUrls } }
      ]
    }).countDocuments();
    
    if (usersWithImageInDrafts > 0) {
      console.log(`Image ${filename} is used in drafts of ${usersWithImageInDrafts} users - skipping deletion`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking if image ${filename} is used in drafts:`, error);
    // В случае ошибки лучше не удалять файл
    return true;
  }
};

/**
 * Cleanup any metadata files that might have been accidentally created for draft images
 * This should be run once on server startup to fix any inconsistencies
 */
export const cleanupDraftMetadata = async (): Promise<void> => {
  try {
    if (!fs.existsSync(metadataDir) || !fs.existsSync(draftsDir)) {
      return;
    }

    console.log('Cleaning up metadata for draft images...');
    
    // Get all files in drafts directory
    const draftFiles = await readdir(draftsDir);
    let removedMetadataCount = 0;
    
    // Get all metadata files
    const metadataFiles = await readdir(metadataDir);
    
    // Check each metadata file
    for (const metaFile of metadataFiles) {
      // Extract original filename from metadata filename (remove .meta extension)
      const originalFilename = metaFile.replace('.meta', '');
      
      // Check if this metadata belongs to a draft file
      if (draftFiles.includes(originalFilename)) {
        // This is metadata for a draft file, which should not exist
        const metadataPath = path.join(metadataDir, metaFile);
        await unlink(metadataPath);
        removedMetadataCount++;
        console.log(`Removed metadata for draft file: ${originalFilename}`);
      }
    }
    
    console.log(`Draft metadata cleanup completed. Removed ${removedMetadataCount} metadata files.`);
  } catch (error) {
    console.error('Error during draft metadata cleanup:', error);
  }
};

/**
 * Delete files older than 7 days from the main uploads folder
 * This only targets the main uploads folder and ignores the drafts folder
 */
export const cleanupOldImages = async (): Promise<void> => {
  try {
    // Make sure the uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      console.log('Uploads directory does not exist. Nothing to clean up.');
      return;
    }

    console.log('Starting cleanup of old images...');
    
    // Get all files in uploads directory (excluding subdirectories)
    const files = await readdir(uploadsDir);
    const cutoffDate = getExpirationDate();
    let deletedCount = 0;
    let skippedCount = 0;
    
    // Process each file
    for (const file of files) {
      try {
        // Skip directories (like the drafts folder) and metadata directory
        const filePath = path.join(uploadsDir, file);
        const fileStat = await stat(filePath);
        
        if (fileStat.isDirectory() || file === '.metadata') {
          continue;
        }
        
        // Skip any file that might be related to drafts (double check)
        if (isDraftImage(filePath)) {
          console.log(`Skipping draft-related image: ${file}`);
          continue;
        }
        
        // Get the creation date of the image (either from timestamp or mtime)
        const creationDate = await getImageCreationDate(file, fileStat);
        
        // Check if the file is older than the cutoff date
        if (creationDate < cutoffDate) {
          // Проверяем, используется ли файл в черновиках пользователей
          const isUsedInDrafts = await isImageUsedInDrafts(file);
          
          if (isUsedInDrafts) {
            // Если файл используется в черновиках, пропускаем его
            skippedCount++;
            console.log(`Skipping file used in drafts: ${file}`);
            continue;
          }
          
          // Файл старше 7 дней и не используется в черновиках - можно удалять
          await unlink(filePath);
          deletedCount++;
          console.log(`Deleted old image: ${file}`);
          
          // Also clean up the timestamp file if it exists
          const timestampPath = path.join(metadataDir, `${file}.meta`);
          if (fs.existsSync(timestampPath)) {
            await unlink(timestampPath);
            console.log(`Deleted timestamp file for: ${file}`);
          }
        }
      } catch (fileError) {
        console.error(`Error processing file ${file}:`, fileError);
      }
    }
    
    console.log(`Cleanup completed. Deleted ${deletedCount} old images. Skipped ${skippedCount} images used in drafts.`);
  } catch (error) {
    console.error('Error during image cleanup:', error);
  }
}; 
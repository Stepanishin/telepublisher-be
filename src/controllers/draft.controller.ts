import { Request, Response } from 'express';
import User, { IDraft } from '../models/user.model';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import storageService, { MAX_STORAGE_PER_USER } from '../services/storage.service';

/**
 * Get all drafts for the current user
 */
export const getDrafts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: user.drafts || []
    });
  } catch (error) {
    console.error('Error getting drafts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get drafts',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get a specific draft by ID
 */
export const getDraftById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const draftId = req.params.id;
    
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }
    
    const draft = user.drafts?.find(draft => draft._id?.toString() === draftId);
    if (!draft) {
      res.status(404).json({
        success: false,
        message: 'Draft not found'
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: draft
    });
  } catch (error) {
    console.error('Error getting draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get draft',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Create a new draft
 */
export const createDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const { title, content, imageUrl, imageUrls, tags } = req.body;
    
    if (!title || !content) {
      res.status(400).json({
        success: false,
        message: 'Title and content are required'
      });
      return;
    }
    
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }
    
    // Initialize drafts array if it doesn't exist
    if (!user.drafts) {
      user.drafts = [];
    }
    
    // Create new draft (Mongoose will add createdAt and updatedAt timestamps)
    const newDraft: Partial<IDraft> = {
      title,
      content,
      imageUrl,
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      tags: Array.isArray(tags) ? tags : []
    };
    
    // Add draft to user's drafts array
    user.drafts.push(newDraft as IDraft);
    await user.save();
    
    // Get the newly created draft (the last one in the array)
    const createdDraft = user.drafts[user.drafts.length - 1];
    
    // Проверяем и обновляем размер хранилища для новых изображений
    // Это нужно сделать здесь, а не в uploadDraftImage, так как при создании
    // драфта пользователь может использовать уже загруженные изображения
    let totalImageSize = 0;
    const imagesToCheck = [];
    
    // Добавляем основное изображение, если оно есть
    if (imageUrl && (imageUrl.includes('/uploads/drafts/') || imageUrl.includes('/uploads/'))) {
      imagesToCheck.push(imageUrl);
    }
    
    // Добавляем дополнительные изображения
    if (Array.isArray(imageUrls) && imageUrls.length > 0) {
      imagesToCheck.push(...imageUrls.filter(url => 
        url && (url.includes('/uploads/drafts/') || url.includes('/uploads/'))
      ));
    }
    
    // Проверяем размер каждого изображения и обновляем счетчик хранилища
    if (imagesToCheck.length > 0) {
      console.log('Checking image sizes for draft:', createdDraft._id);
      
      for (const url of imagesToCheck) {
        const filename = extractFilenameFromUrl(url);
        if (filename) {
          let imagePath = '';
          
          if (url.includes('/uploads/drafts/')) {
            imagePath = path.join(__dirname, '../../uploads/drafts', filename);
          } else if (url.includes('/uploads/')) {
            imagePath = path.join(__dirname, '../../uploads', filename);
          }
          
          if (imagePath && fs.existsSync(imagePath)) {
            try {
              const stats = fs.statSync(imagePath);
              totalImageSize += stats.size;
              console.log(`Image "${filename}" size: ${stats.size} bytes`);
            } catch (err) {
              console.error(`Error checking image "${filename}" size:`, err);
            }
          }
        }
      }
      
      // Обновляем счетчик использованного места
      if (totalImageSize > 0) {
        await storageService.updateStorageUsed(userId, totalImageSize);
        console.log(`Updated storage for user ${userId} by adding ${totalImageSize} bytes`);
      }
    }
    
    // Получаем обновленную информацию о хранилище
    const storageInfo = await storageService.getStorageInfo(userId);
    
    res.status(201).json({
      success: true,
      message: 'Draft created successfully',
      data: createdDraft,
      storageInfo
    });
  } catch (error) {
    console.error('Error creating draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create draft',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Update an existing draft
 */
export const updateDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const draftId = req.params.id;
    const { title, content, imageUrl, imageUrls, tags } = req.body;
    
    if (!title && !content && !imageUrl && !imageUrls && !tags) {
      res.status(400).json({
        success: false,
        message: 'At least one field to update is required'
      });
      return;
    }
    
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }
    
    // Find the draft index
    const draftIndex = user.drafts?.findIndex(draft => draft._id?.toString() === draftId) ?? -1;
    
    if (draftIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Draft not found'
      });
      return;
    }
    
    // Получаем старый драфт перед обновлением
    const oldDraft = user.drafts![draftIndex];
    
    // Массивы для отслеживания изменений в изображениях
    const removedImages: { path: string; size: number }[] = [];
    const addedImageUrls: string[] = [];
    
    // Если URL изображения изменился, отслеживаем старое для удаления
    if (imageUrl !== undefined && oldDraft.imageUrl && oldDraft.imageUrl !== imageUrl) {
      // Извлекаем имя файла из URL
      const filename = extractFilenameFromUrl(oldDraft.imageUrl);
      if (filename) {
        // Проверяем наличие файла в папке /uploads/drafts/
        const pathInDrafts = path.join(__dirname, '../../uploads/drafts', filename);
        if (fs.existsSync(pathInDrafts)) {
          try {
            const stats = fs.statSync(pathInDrafts);
            removedImages.push({ path: pathInDrafts, size: stats.size });
          } catch (err) {
            console.error('Error checking removed image file:', err);
          }
        }
        
        // Проверяем наличие файла в корневой папке /uploads/
        const pathInRoot = path.join(__dirname, '../../uploads', filename);
        if (fs.existsSync(pathInRoot)) {
          try {
            const stats = fs.statSync(pathInRoot);
            removedImages.push({ path: pathInRoot, size: stats.size });
          } catch (err) {
            console.error('Error checking removed image file:', err);
          }
        }
      }
      
      // Если новый URL включает uploads/drafts или uploads, отслеживаем его
      if (imageUrl && (imageUrl.includes('/uploads/drafts/') || imageUrl.includes('/uploads/'))) {
        addedImageUrls.push(imageUrl);
      }
    }
    
    // Если массив URLs изображений изменился, отслеживаем изменения
    if (imageUrls !== undefined && oldDraft.imageUrls) {
      // Находим удаленные изображения
      oldDraft.imageUrls.forEach((url: string) => {
        // Проверяем, есть ли URL в новом списке
        if (!imageUrls || !imageUrls.includes(url)) {
          // Извлекаем имя файла из URL
          const filename = extractFilenameFromUrl(url);
          if (filename) {
            // Проверяем наличие файла в папке /uploads/drafts/
            const pathInDrafts = path.join(__dirname, '../../uploads/drafts', filename);
            if (fs.existsSync(pathInDrafts)) {
              try {
                const stats = fs.statSync(pathInDrafts);
                removedImages.push({ path: pathInDrafts, size: stats.size });
              } catch (err) {
                console.error('Error checking removed image file:', err);
              }
            }
            
            // Проверяем наличие файла в корневой папке /uploads/
            const pathInRoot = path.join(__dirname, '../../uploads', filename);
            if (fs.existsSync(pathInRoot)) {
              try {
                const stats = fs.statSync(pathInRoot);
                removedImages.push({ path: pathInRoot, size: stats.size });
              } catch (err) {
                console.error('Error checking removed image file:', err);
              }
            }
          }
        }
      });
      
      // Находим добавленные изображения
      if (imageUrls) {
        imageUrls.forEach((url: string) => {
          if (!oldDraft.imageUrls?.includes(url) && 
              (url.includes('/uploads/drafts/') || url.includes('/uploads/'))) {
            addedImageUrls.push(url);
          }
        });
      }
    }
    
    // Update draft fields if provided
    const draft = user.drafts![draftIndex];
    
    if (title) draft.title = title;
    if (content) draft.content = content;
    if (imageUrl !== undefined) draft.imageUrl = imageUrl;
    if (imageUrls !== undefined) draft.imageUrls = Array.isArray(imageUrls) ? imageUrls : [];
    if (tags !== undefined) draft.tags = Array.isArray(tags) ? tags : [];
    
    await user.save();
    
    // Удаляем неиспользуемые изображения
    if (removedImages.length > 0) {
      for (const img of removedImages) {
        try {
          // Используем сервис хранилища для удаления файла
          await storageService.deleteFile(userId, img.path);
          console.log(`Deleted file: ${img.path}`);
        } catch (err) {
          console.error('Error deleting removed image:', err);
        }
      }
    }
    
    // Проверяем и обновляем размер хранилища для новых изображений
    let totalNewImagesSize = 0;
    
    for (const url of addedImageUrls) {
      const filename = extractFilenameFromUrl(url);
      if (filename) {
        let imagePath = '';
        
        if (url.includes('/uploads/drafts/')) {
          imagePath = path.join(__dirname, '../../uploads/drafts', filename);
        } else if (url.includes('/uploads/')) {
          imagePath = path.join(__dirname, '../../uploads', filename);
        }
        
        if (imagePath && fs.existsSync(imagePath)) {
          try {
            const stats = fs.statSync(imagePath);
            totalNewImagesSize += stats.size;
            console.log(`Added image "${filename}" size: ${stats.size} bytes`);
          } catch (err) {
            console.error(`Error checking added image "${filename}" size:`, err);
          }
        }
      }
    }
    
    // Обновляем счетчик использованного места для новых изображений
    if (totalNewImagesSize > 0) {
      await storageService.updateStorageUsed(userId, totalNewImagesSize);
      console.log(`Updated storage for user ${userId} by adding ${totalNewImagesSize} bytes`);
    }
    
    // Получаем обновленную информацию о хранилище
    const storageInfo = await storageService.getStorageInfo(userId);
    
    res.status(200).json({
      success: true,
      message: 'Draft updated successfully',
      data: draft,
      storageInfo
    });
  } catch (error) {
    console.error('Error updating draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update draft',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Delete a draft
 */
export const deleteDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const draftId = req.params.id;
    
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }
    
    // Find the draft index
    const draftIndex = user.drafts?.findIndex(draft => draft._id?.toString() === draftId) ?? -1;
    
    if (draftIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Draft not found'
      });
      return;
    }
    
    // Get the draft to check for images
    const draft = user.drafts![draftIndex];
    
    // Remove draft from user's drafts array
    user.drafts!.splice(draftIndex, 1);
    await user.save();
    
    // Массив для хранения путей к файлам, которые нужно удалить
    const filesToDelete: string[] = [];
    
    // Проверяем и собираем пути ко всем файлам, связанным с удаляемым драфтом
    if (draft.imageUrl) {
      // Извлекаем имя файла из URL
      const filename = extractFilenameFromUrl(draft.imageUrl);
      if (filename) {
        // Проверяем в папке /uploads/drafts/
        const pathInDrafts = path.join(__dirname, '../../uploads/drafts', filename);
        if (fs.existsSync(pathInDrafts)) {
          filesToDelete.push(pathInDrafts);
        }
        
        // Проверяем также в корневой папке /uploads/
        const pathInRoot = path.join(__dirname, '../../uploads', filename);
        if (fs.existsSync(pathInRoot)) {
          filesToDelete.push(pathInRoot);
        }
      }
    }
    
    if (draft.imageUrls && draft.imageUrls.length > 0) {
      draft.imageUrls.forEach(url => {
        // Извлекаем имя файла из URL
        const filename = extractFilenameFromUrl(url);
        if (filename) {
          // Проверяем в папке /uploads/drafts/
          const pathInDrafts = path.join(__dirname, '../../uploads/drafts', filename);
          if (fs.existsSync(pathInDrafts)) {
            filesToDelete.push(pathInDrafts);
          }
          
          // Проверяем также в корневой папке /uploads/
          const pathInRoot = path.join(__dirname, '../../uploads', filename);
          if (fs.existsSync(pathInRoot)) {
            filesToDelete.push(pathInRoot);
          }
        }
      });
    }
    
    // Удаляем все файлы и обновляем использованное пространство хранилища
    console.log(`Deleting ${filesToDelete.length} files for draft ${draftId}`);
    
    // Удаляем файлы с помощью сервиса хранилища
    for (const filePath of filesToDelete) {
      try {
        await storageService.deleteFile(userId, filePath);
        console.log(`Deleted file: ${filePath}`);
      } catch (err) {
        console.error(`Error deleting file ${filePath}:`, err);
      }
    }
    
    // Получаем обновленную информацию о хранилище
    const storageInfo = await storageService.getStorageInfo(userId);
    
    res.status(200).json({
      success: true,
      message: 'Draft deleted successfully',
      storageInfo
    });
  } catch (error) {
    console.error('Error deleting draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete draft',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Извлекает имя файла из URL изображения
 */
function extractFilenameFromUrl(url: string): string | null {
  if (!url) return null;
  
  try {
    // Удаляем параметры URL
    const urlWithoutParams = url.split('?')[0];
    
    // Случай 1: URL содержит /uploads/drafts/
    if (urlWithoutParams.includes('/uploads/drafts/')) {
      return urlWithoutParams.substring(urlWithoutParams.lastIndexOf('/') + 1);
    }
    
    // Случай 2: URL содержит /uploads/
    if (urlWithoutParams.includes('/uploads/')) {
      return urlWithoutParams.substring(urlWithoutParams.lastIndexOf('/') + 1);
    }
    
    // В других случаях просто извлекаем имя файла из пути
    // Используем URL API для корректного разбора URL
    try {
      const pathname = new URL(urlWithoutParams).pathname;
      return pathname.substring(pathname.lastIndexOf('/') + 1);
    } catch (e) {
      // Если это не валидный URL, попробуем простую логику извлечения
      return urlWithoutParams.substring(urlWithoutParams.lastIndexOf('/') + 1);
    }
  } catch (error) {
    console.error('Error extracting filename from URL:', error);
    return null;
  }
}

/**
 * Upload an image for a draft
 */
export const uploadDraftImage = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No image provided'
      });
      return;
    }
    
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    // Подробное логирование
    console.log('File upload attempt for draft:');
    console.log('Original URL:', req.originalUrl);
    console.log('File path:', req.file.path);
    console.log('File destination:', req.file.destination);
    console.log('File filename:', req.file.filename);
    console.log('File size:', req.file.size);
    
    // Проверяем, не превысит ли пользователь лимит хранилища
    const willExceedLimit = !(await storageService.checkStorageLimit(userId, req.file.size));
    if (willExceedLimit) {
      // Удаляем загруженный файл, так как он превышает лимит
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(413).json({
        success: false,
        message: 'Storage limit exceeded',
        storageLimit: {
          limit: MAX_STORAGE_PER_USER,
          required: req.file.size,
          message: `You have reached your storage limit of ${Math.round(MAX_STORAGE_PER_USER / (1024 * 1024))} MB. Please delete some images before uploading new ones.`
        }
      });
      return;
    }
    
    // Файл уже сохранен multer'ом (должен быть в /uploads/drafts/)
    const originalPath = req.file.path;
    const filename = path.basename(originalPath);
    
    // Generate URL for the uploaded image
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? process.env.API_BASE_URL || req.protocol + '://' + req.get('host')
      : 'http://localhost:' + (process.env.PORT || 5000);
    
    // Получаем путь к директории черновиков
    const draftsDir = path.join(__dirname, '../../uploads/drafts');
    
    // Проверяем, находится ли файл в директории черновиков
    let imageUrl;
    const isInDraftsDir = originalPath.includes('/uploads/drafts/') || originalPath.includes('\\uploads\\drafts\\');
    
    if (!isInDraftsDir) {
      // Если файл был сохранен в основную директорию, перемещаем его в директорию черновиков
      console.warn('WARNING: Draft image was not saved in drafts directory! Moving it...');
      
      // Создаем директорию черновиков если она не существует
      if (!fs.existsSync(draftsDir)) {
        fs.mkdirSync(draftsDir, { recursive: true });
      }
      
      const newPath = path.join(draftsDir, filename);
      console.log(`Moving file from ${originalPath} to ${newPath}`);
      
      try {
        // Копируем файл
        fs.copyFileSync(originalPath, newPath);
        // Удаляем оригинал
        fs.unlinkSync(originalPath);
        console.log(`Successfully moved file to drafts directory`);
        
        // Обновляем путь
        imageUrl = `${baseUrl}/uploads/drafts/${filename}`;
      } catch (moveError) {
        console.error('Error moving file to drafts directory:', moveError);
        // Если не удалось переместить, используем оригинальный путь
        imageUrl = `${baseUrl}/${path.relative(path.join(__dirname, '../..'), originalPath).replace(/\\/g, '/')}`;
      }
    } else {
      // Файл уже в директории черновиков
      imageUrl = `${baseUrl}/uploads/drafts/${filename}`;
      console.log('File saved in drafts directory');
    }
    
    // Обновляем использованное пространство пользователя
    await storageService.updateStorageUsed(userId, req.file.size);
    
    // Получаем информацию о хранилище для информирования пользователя
    const storageInfo = await storageService.getStorageInfo(userId);
    
    console.log('Generated image URL:', imageUrl);
    
    res.status(200).json({
      success: true,
      imageUrl,
      storageInfo
    });
  } catch (error) {
    console.error('Error uploading draft image:', error);
    
    // If there's an uploaded file, delete it in case of error
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get storage information for the current user
 */
export const getStorageInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const storageInfo = await storageService.getStorageInfo(userId);
    
    res.status(200).json({
      success: true,
      data: {
        ...storageInfo,
        usedMB: Math.round(storageInfo.used / 1024 / 1024 * 100) / 100,
        totalMB: Math.round(storageInfo.total / 1024 / 1024 * 100) / 100
      }
    });
  } catch (error) {
    console.error('Error getting storage info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get storage information',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 
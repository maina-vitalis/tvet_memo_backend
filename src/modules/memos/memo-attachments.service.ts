import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { attachments, memos } from '../../database/schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

export const MEMO_ATTACHMENT_MAX_FILES = 5;
export const MEMO_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const MEMO_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export type MemoAttachmentView = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedAt: string;
};

@Injectable()
export class MemoAttachmentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async listForMemo(memoId: string): Promise<MemoAttachmentView[]> {
    const rows = await this.db
      .select()
      .from(attachments)
      .where(eq(attachments.memoId, memoId));

    return rows.map((row) => this.toView(row));
  }

  async upload(
    institutionId: string,
    memoId: string,
    uploadedBy: string,
    file: Express.Multer.File,
  ): Promise<MemoAttachmentView> {
    const memo = await this.getDraftMemoForSender(
      institutionId,
      memoId,
      uploadedBy,
    );

    const existing = await this.listForMemo(memo.id);
    if (existing.length >= MEMO_ATTACHMENT_MAX_FILES) {
      throw new BadRequestException(
        `A memo can have at most ${MEMO_ATTACHMENT_MAX_FILES} attachments`,
      );
    }

    const uploadResult = await this.cloudinaryService.uploadBuffer(
      file.buffer,
      {
        folder: `memo/attachments/${memo.id}`,
        resource_type: 'auto',
        public_id: `${Date.now()}-${file.originalname.replace(/[^\w.-]+/g, '_')}`,
      },
    );

    const [created] = await this.db
      .insert(attachments)
      .values({
        memoId: memo.id,
        uploadedBy,
        originalFilename: file.originalname,
        storageKey: uploadResult.secure_url,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      })
      .returning();

    return this.toView(created);
  }

  async remove(
    institutionId: string,
    memoId: string,
    attachmentId: string,
    actorId: string,
  ): Promise<{ id: string }> {
    await this.getDraftMemoForSender(institutionId, memoId, actorId);

    const [row] = await this.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!row || row.memoId !== memoId) {
      throw new NotFoundException('Attachment not found');
    }

    await this.db.delete(attachments).where(eq(attachments.id, attachmentId));

    return { id: attachmentId };
  }

  private async getDraftMemoForSender(
    institutionId: string,
    memoId: string,
    senderId: string,
  ) {
    const [memo] = await this.db
      .select()
      .from(memos)
      .where(eq(memos.id, memoId))
      .limit(1);

    if (!memo || memo.institutionId !== institutionId) {
      throw new NotFoundException('Memo not found');
    }

    if (memo.senderId !== senderId) {
      throw new ForbiddenException('Only the sender can modify attachments');
    }

    if (memo.status !== 'draft') {
      throw new BadRequestException(
        'Attachments can only be added to draft memos',
      );
    }

    return memo;
  }

  private toView(row: typeof attachments.$inferSelect): MemoAttachmentView {
    return {
      id: row.id,
      fileName: row.originalFilename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      url: row.storageKey,
      uploadedAt: row.uploadedAt.toISOString(),
    };
  }
}

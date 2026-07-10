import COS from 'cos-js-sdk-v5'
import axios from '@/ajax'

/** COS 临时凭证 */
export interface CosReturnData {
  tmpSecretId: string
  tmpSecretKey: string
  sessionToken: string
  startTime: number
  expiredTime: number
  bucket: string
  region: string
  /** 后端下发的允许上传前缀，如 uploads/123456/ */
  uploadPrefix?: string
}

/** COS 上传结果 */
export interface CosUploadResult {
  /** 对象在 COS 中的 Key */
  key: string
  /** 可访问的 HTTPS 地址 */
  url: string
}

/** COS SDK 错误结构 */
interface CosSdkError {
  statusCode?: number
  error?: {
    Code?: string
    Message?: string
    Resource?: string
    RequestId?: string
  }
}

/**
 * 获取 COS 临时上传凭证
 */
export const getCosToken = (): Promise<CosReturnData> => {
  return axios.get('/cos/credential')
}

/**
 * 将时间戳统一为 COS SDK 需要的秒级时间
 * @param value 秒或毫秒时间戳
 */
function normalizeCosTime(value: number): number {
  if (!value) return value
  return value > 1_000_000_000_000 ? Math.floor(value / 1000) : value
}

/**
 * 规范化后端返回的 COS 凭证字段（兼容 camelCase / PascalCase / 嵌套 credentials）
 * @param raw 接口原始 data
 */
function normalizeCredential(raw: Record<string, unknown>): CosReturnData {
  const source = (raw.credentials ?? raw) as Record<string, unknown>

  const credential: CosReturnData = {
    tmpSecretId: String(source.tmpSecretId ?? source.TmpSecretId ?? ''),
    tmpSecretKey: String(source.tmpSecretKey ?? source.TmpSecretKey ?? ''),
    sessionToken: String(source.sessionToken ?? source.SessionToken ?? source.token ?? ''),
    startTime: normalizeCosTime(Number(source.startTime ?? source.StartTime ?? 0)),
    expiredTime: normalizeCosTime(Number(source.expiredTime ?? source.ExpiredTime ?? 0)),
    bucket: String(raw.bucket ?? source.bucket ?? ''),
    region: String(raw.region ?? source.region ?? ''),
    uploadPrefix: String(raw.uploadPrefix ?? raw.allowPrefix ?? source.uploadPrefix ?? source.allowPrefix ?? ''),
  }

  if (!credential.uploadPrefix) {
    delete credential.uploadPrefix
  }

  return credential
}

/**
 * 解析 COS SDK 上传错误
 * @param err SDK 回调错误
 */
function formatCosUploadError(err: unknown): string {
  const cosError = err as CosSdkError
  const code = cosError.error?.Code
  const message = cosError.error?.Message
  const statusCode = cosError.statusCode

  if (code || message) {
    return `[${statusCode ?? 'COS'}] ${code ?? 'Error'}: ${message ?? '上传被拒绝'}`
  }

  if (err instanceof Error) {
    return err.message
  }

  return 'COS 上传失败'
}

/**
 * 构建上传对象 Key
 * @param account 当前用户账号
 * @param fileName 文件名
 * @param uploadPrefix 后端限制的上传前缀
 */
function buildUploadKey(account: string, fileName: string, uploadPrefix?: string): string {
  if (uploadPrefix) {
    const prefix = uploadPrefix.endsWith('/') ? uploadPrefix : `${uploadPrefix}/`
    return `${prefix}${fileName}`
  }

  return `uploads/${account}/${fileName}`
}

/**
 * 上传图片到 COS 的 uploads/{account} 目录
 * @param file 待上传图片文件
 * @param account 当前用户账号（临时密钥已限制只能写入该目录）
 */
export async function uploadImageToCos(file: File, account: string): Promise<CosUploadResult> {
  const rawCredential = (await getCosToken()) as unknown as Record<string, unknown>
  const credential = normalizeCredential(rawCredential)

  if (!credential.tmpSecretId || !credential.tmpSecretKey || !credential.sessionToken) {
    throw new Error('COS 凭证不完整，请检查 /cos/credential 返回字段')
  }

  if (!credential.bucket || !credential.region) {
    throw new Error('COS 凭证缺少 bucket 或 region')
  }

  const cos = new COS({
    Protocol: 'https:',
    getAuthorization(_options, callback) {
      callback({
        TmpSecretId: credential.tmpSecretId,
        TmpSecretKey: credential.tmpSecretKey,
        SecurityToken: credential.sessionToken,
        StartTime: credential.startTime,
        ExpiredTime: credential.expiredTime,
      })
    },
  })

  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  const key = buildUploadKey(account, fileName, credential.uploadPrefix)

  console.log('[COS Upload] 开始上传', {
    bucket: credential.bucket,
    region: credential.region,
    key,
    contentType: file.type,
    uploadPrefix: credential.uploadPrefix,
  })

  const uploadResult = await new Promise<{ Location: string }>((resolve, reject) => {
    cos.putObject(
      {
        Bucket: credential.bucket,
        Region: credential.region,
        Key: key,
        Body: file,
        ContentType: file.type || 'application/octet-stream',
      },
      (err, data) => {
        if (err) {
          console.error('[COS Upload] 上传失败', err)
          reject(new Error(formatCosUploadError(err)))
          return
        }
        resolve(data)
      },
    )
  })

  const location = uploadResult.Location
  const url = location.startsWith('http') ? location : `https://${location}`

  console.log('[COS Upload] 上传完成', { url, key })

  return { key, url }
}

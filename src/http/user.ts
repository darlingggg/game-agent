import axios, { setTokens } from '@/ajax'

interface RegisterUserParams {
  account: string
  password: string
  /** 昵称，可选 */
  nickname?: string
}

interface AuthTokenResponse {
  id: string
  account: string
  nickname: string
  role?: UserRole
  accessToken: string
  refreshToken: string
}

interface LoginUserParams {
  account: string
  password: string
}

export type UserRole = 'super' | 'admin' | 'normal' | 'disabled'

export interface UserInfoResponse {
  id: number
  account: string
  nickname: string
  role: UserRole
  avatar?: string | null
  bindings?: {
    qq: boolean
    wechat: boolean
  }
}

export type UserProfileField = 'account' | 'password' | 'avatar' | 'nickname' | 'qq' | 'wx'

export interface UpdateUserProfileRequest {
  account?: string
  currentPassword?: string
  password?: string
  avatar?: string
  nickname?: string
  qq?: false
  wx?: false
}

export interface UpdateUserProfileResponse extends UserInfoResponse {
  updatedFields: UserProfileField[]
  ignoredFields: UserProfileField[]
  accessToken?: string
  refreshToken?: string
}

/** 注册用户 */
export const registerUser = (data: RegisterUserParams): Promise<AuthTokenResponse> => {
  return axios.post('/register', data)
}

/** 登录用户 */
export const loginUser = (data: LoginUserParams): Promise<AuthTokenResponse> => {
  return axios.post('/login', data)
}

/** 获取用户信息 */
export const getUserInfo = (): Promise<UserInfoResponse> => {
  return axios.get('/user/profile')
}

/** 更新当前用户资料；修改账号或密码时同步替换后端签发的新 Token */
export const updateUserProfile = async (data: UpdateUserProfileRequest): Promise<UpdateUserProfileResponse> => {
  const profile = await axios.patch<never, UpdateUserProfileResponse>('/user/profile', data)
  if (profile.accessToken && profile.refreshToken) {
    setTokens(profile.accessToken, profile.refreshToken)
  }
  return profile
}

/** 登出，吊销 Refresh Token */
export const logoutUser = (refreshToken: string): Promise<void> => {
  return axios.post('/auth/logout', { refreshToken })
}

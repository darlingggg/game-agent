import axios from '@/ajax'

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
  accessToken: string
  refreshToken: string
}

interface LoginUserParams {
  account: string
  password: string
}

interface UserInfoResponse {
  id: string
  account: string
  nickname: string
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

/** 登出，吊销 Refresh Token */
export const logoutUser = (refreshToken: string): Promise<void> => {
  return axios.post('/auth/logout', { refreshToken })
}

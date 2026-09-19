import pkg from '@/package.json'

/** apps/api/package.json의 version. 배포할 때 올리면 /health에 그대로 나온다 */
export const API_VERSION: string = pkg.version

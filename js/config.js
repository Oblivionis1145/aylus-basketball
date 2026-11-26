// 在 Supabase 后台 → Project Settings → API 里复制这两个值填进来。
// publishable（anon）key 是公开密钥，放在网页里是安全的（真正的权限由数据库规则控制）。
export const SUPABASE_URL = 'https://qxjqigohltnmiakddyjl.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_r3AO-yvUPT1CJ3FioJIa5w_nFALWhiU';

// 球场位置（用于天气预报）
export const PARK = { lat: 40.806, lon: -73.487, name: 'Syosset-Woodbury Community Park' };

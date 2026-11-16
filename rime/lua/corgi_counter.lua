-- Original code, MIT. Never writes text, key codes, app names, or window titles.
local M = {}
local serial = 0
local function count(text)
  if type(text) ~= 'string' then return 0 end
  local ok, n = pcall(utf8.len, text)
  return ok and n or 0
end
local function emit(env, ctx)
  if ctx:get_option('corgi_pause') then return end -- privacy pause: do not even read text
  local n = count(ctx:get_commit_text())
  if n < 1 or n > 100000 then return end
  local day = os.date('%Y-%m-%d')
  if env.corgi_day ~= day then
    env.corgi_day, env.corgi_total, env.corgi_seq = day, 0, 0
  end
  env.corgi_total = env.corgi_total + n
  env.corgi_seq = env.corgi_seq + 1
  local slot = env.corgi_seq % 2 == 0 and 'a' or 'b'
  local path = env.corgi_dir .. '/' .. day .. '-' .. env.corgi_session .. '-' .. slot .. '.stats'
  local f = io.open(path, 'wb')
  if not f then return end -- no directory creation, process spawn or network in input path
  f:write(string.format('CORGI1\t%s\t%s\t%d\t%d\n', day, env.corgi_session, env.corgi_seq, env.corgi_total))
  f:close()
end
function M.init(env)
  -- os.tmpname gives a process-independent unique name without shell commands.
  local ok, temp = pcall(os.tmpname)
  if not ok or not temp then return end -- fail closed rather than risk shared session ids
  os.remove(temp)
  serial = serial + 1
  local token = temp:match('[^/\\]+$'):gsub('[^%w_]', '')
  env.corgi_session = string.format('%s_%d_%d', token, os.time(), serial)
  env.corgi_dir = rime_api.get_user_data_dir() .. '/corgi-stats'
  env.corgi_conn = env.engine.context.commit_notifier:connect(function(ctx)
    pcall(emit, env, ctx) -- telemetry failure must never break the IME
  end)
end
function M.func(_, _) return 2 end -- kNoop: never consume or alter a key
function M.fini(env)
  if env.corgi_conn then env.corgi_conn:disconnect(); env.corgi_conn = nil end
end
M.count = count
return M

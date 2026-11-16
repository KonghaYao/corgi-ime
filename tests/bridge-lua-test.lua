local M = dofile('rime/lua/corgi_counter.lua')
assert(M.count('中文') == 2)
assert(M.count('a😀') == 2)
assert(M.count('e\204\129') == 2) -- codepoints, NOT grapheme clusters
assert(M.count('\255') == 0)
assert(M.func(nil,nil)==2)
local callback, disconnected, captured
rime_api = {get_user_data_dir=function() return '/missing/corgi-test' end}
local env = {engine={context={commit_notifier={connect=function(_,fn) callback=fn; return {disconnect=function() disconnected=true end} end}}}}
M.init(env)
assert(type(callback)=='function')
callback({get_option=function() return false end, get_commit_text=function() return '中文' end}) -- missing folder must not propagate
local original_open = io.open
io.open = function(filename,mode)
 assert(not filename:find('中文',1,true))
 return {write=function(_,text) captured=text end, close=function()end}
end
callback({get_option=function() return false end, get_commit_text=function() return 'secret中文' end})
local before = captured
callback({get_option=function(_,name) assert(name=='corgi_pause'); return true end,
  get_commit_text=function() error('Paused path must not read text') end})
assert(captured == before and env.corgi_total == 10 and env.corgi_seq == 2)
callback({get_option=function() return false end, get_commit_text=function() return '好' end})
assert(env.corgi_total == 11 and env.corgi_seq == 3) -- no catch-up of paused input
assert(captured:match('\t3\t11\n'))
captured = before
io.open = original_open
assert(captured:match('CORGI1\t%d%d%d%d%-%d%d%-%d%d\t[%w_]+\t2\t10\n'))
assert(not captured:find('secret',1,true))
M.fini(env); assert(disconnected)
print('PASS Lua unicode, fail-open IME, privacy, notifier lifecycle')

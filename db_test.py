from database import init_db, get_history, save_chat, delete_history

# reset schema and verify empty
init_db()
print('updated schema, entries count:', len(get_history()))

# add a couple of dummy entries then delete
save_chat('hello', 'hello', 'world', sensitive=False)
save_chat('foo', 'foo', 'bar', sensitive=True)
print('after inserts:', len(get_history(include_sensitive=True)))

# delete first entry
hist = get_history(include_sensitive=True)
if hist:
    delete_history(hist[0]['id'])
print('after deleting one:', len(get_history(include_sensitive=True)))

# clear all
delete_history()
print('after clearing all:', len(get_history(include_sensitive=True)))

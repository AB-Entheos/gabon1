import json
for f in [
    r"C:\Users\markj\Documents\Emergency_Sys_Gabon\frontend\src\i18n\en.json",
    r"C:\Users\markj\Documents\Emergency_Sys_Gabon\frontend\src\i18n\fr.json",
]:
    try:
        with open(f, encoding="utf-8") as fh:
            json.load(fh)
        print(f"OK: {f}")
    except Exception as e:
        print(f"BAD: {f}  -> {e}")

"""Add the 'upload' top-level key to both i18n files."""
import json

FILES = {
    "en": r"C:\Users\markj\Documents\Emergency_Sys_Gabon\frontend\src\i18n\en.json",
    "fr": r"C:\Users\markj\Documents\Emergency_Sys_Gabon\frontend\src\i18n\fr.json",
}

UPLOAD = {
    "en": {
        "cta": "Click or drop a file to upload",
        "queued": "Queued (offline). Will sync when online.",
        "description_label": "Description / alt text",
        "description_placeholder": "What does this document show?",
        "uploader_label": "Uploaded by",
        "uploader_placeholder": "e.g. CB Jean Mboumba",
        "ready_to_submit": "Ready to upload. Click Submit to add this file to the case.",
        "submit_button": "Submit",
    },
    "fr": {
        "cta": "Cliquez ou déposez un fichier",
        "queued": "Mis en file d'attente (hors ligne). Synchronisation automatique.",
        "description_label": "Description / texte alternatif",
        "description_placeholder": "Que montre ce document ?",
        "uploader_label": "Téléversé par",
        "uploader_placeholder": "ex. CB Jean Mboumba",
        "ready_to_submit": "Prêt à téléverser. Cliquez sur Envoyer pour ajouter ce fichier au dossier.",
        "submit_button": "Envoyer",
    },
}

for lang, path in FILES.items():
    with open(path, "r", encoding="utf-8") as fp:
        data = json.load(fp)
    data.setdefault("upload", {})
    for k, v in UPLOAD[lang].items():
        data["upload"].setdefault(k, v)
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    print(f"updated {path}")

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_attachment(request, submission_id: int, attachment_id: int):
    """Stream the bytes of a FormAttachment.

    On S3 prod, redirect to a presigned GET URL. On dev (local fs) the
    bytes are served inline so the browser can render image previews.
    """
    att = get_object_or_404(
        FormAttachment.objects.select_related("submission__case", "submission__case__created_by"),
        id=attachment_id,
        submission_id=submission_id,
    )
    case = att.submission.case

    user = request.user
    if user.role not in {"ADMIN", "SUPER_ADMIN"}:
        if case.status == "DRAFT" and case.created_by_id != user.id:
            return Response({"detail": "Forbidden."}, status=403)
        if case.status != "DRAFT" and user.role in user.FIELD_REPORTER_ROLES and case.created_by_id != user.id:
            return Response({"detail": "Forbidden."}, status=403)

    signed = presign_get(key=att.s3_key)
    if signed:
        return HttpResponseRedirect(signed)

    data = read_attachment_bytes(key=att.s3_key)
    if data is None:
        return Response({"detail": "File not found on storage."}, status=404)

    response = HttpResponse(data, content_type=att.mime or "application/octet-stream")
    response["Content-Length"] = str(len(data))
    response["Content-Disposition"] = f'inline; filename="{att.filename}"'
    response["X-Content-SHA256"] = att.sha256
    return response

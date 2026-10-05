CREATE OR REPLACE FUNCTION public.chat_after_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_url text := 'https://ehjtoajnlnuvuiwkpmbp.supabase.co/functions/v1/notify-new-message';
  v_hotel_id uuid;
  v_has_attachment boolean;
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(COALESCE(NEW.body, '[đính kèm]'), 200),
      last_sender_id = NEW.sender_id,
      updated_at = now()
  WHERE id = NEW.conversation_id
  RETURNING hotel_id INTO v_hotel_id;

  SELECT EXISTS(
    SELECT 1 FROM public.message_attachments WHERE message_id = NEW.id
  ) INTO v_has_attachment;

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'message_id', NEW.id,
        'conversation_id', NEW.conversation_id,
        'tenant_id', NEW.tenant_id,
        'hotel_id', v_hotel_id,
        'sender_id', NEW.sender_id,
        'body', NEW.body,
        'has_attachment', COALESCE(v_has_attachment, false)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify-new-message dispatch failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
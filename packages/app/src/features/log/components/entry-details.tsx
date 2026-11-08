import { ENTRY_NOTE_MAX_LENGTH, VENUE_MAX_LENGTH } from '@proofofcalm/core';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@proofofcalm/ui/components/collapsible';
import { Field, FieldError, FieldLabel } from '@proofofcalm/ui/components/field';
import { Input } from '@proofofcalm/ui/components/input';
import { Textarea } from '@proofofcalm/ui/components/textarea';
import { useTranslations } from 'use-intl';

export type EntryDetailsProps = {
  readonly venue: string;
  readonly note: string;
  /** A refused save's message under its field, in words; null when there is none. */
  readonly venueError: string | null;
  readonly noteError: string | null;
  /** The venue above the collapsible, so it shows without opening it; the collapsible then holds the note alone. */
  readonly venueShown: boolean;
  readonly open: boolean;
  onOpenChange(open: boolean): void;
  onChange(patch: { readonly venue?: string; readonly note?: string }): void;
};

/** The entry form's "Venue and note": both optional, each stopped at the length an entry stores. */
export function EntryDetails(props: EntryDetailsProps) {
  const { venue, note, venueError, noteError, venueShown, open, onOpenChange, onChange } = props;
  const t = useTranslations('log.form');
  const venueField = (
    <Field invalid={venueError !== null}>
      <FieldLabel>{t('venue')}</FieldLabel>
      <Input value={venue} maxLength={VENUE_MAX_LENGTH} onChange={(event) => onChange({ venue: event.target.value })} />
      {venueError !== null && <FieldError>{venueError}</FieldError>}
    </Field>
  );
  return (
    <>
      {venueShown && venueField}
      <Collapsible open={open} onOpenChange={onOpenChange} className="flex flex-col gap-stack-sm">
        <CollapsibleTrigger>{t(venueShown ? 'addNote' : 'details')}</CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-stack-sm">
          {!venueShown && venueField}
          <Field invalid={noteError !== null}>
            <FieldLabel>{t('note')}</FieldLabel>
            <Textarea
              value={note}
              maxLength={ENTRY_NOTE_MAX_LENGTH}
              onChange={(event) => onChange({ note: event.target.value })}
            />
            {noteError !== null && <FieldError>{noteError}</FieldError>}
          </Field>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

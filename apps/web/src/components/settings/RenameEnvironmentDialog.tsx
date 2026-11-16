import type { EnvironmentId } from "@t3tools/contracts";
import { useId, useState } from "react";

import { environmentCatalog } from "~/connection/catalog";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

export function RenameEnvironmentDialog({
  environmentId,
  label,
  open,
  onOpenChange,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <RenameEnvironmentForm
          environmentId={environmentId}
          label={label}
          onDone={() => onOpenChange(false)}
        />
      </DialogPopup>
    </Dialog>
  );
}

function RenameEnvironmentForm({
  environmentId,
  label,
  onDone,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly onDone: () => void;
}) {
  const formId = useId();
  const [name, setName] = useState(label);
  const setEnvironmentName = useAtomCommand(environmentCatalog.setName, "environment rename");
  const save = () => {
    void setEnvironmentName({ environmentId, name });
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename environment</DialogTitle>
        <DialogDescription>
          The name shows only on this device. Leave it empty to use the environment's own name.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Input
            aria-label="Environment name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </form>
      </DialogPanel>
      <DialogFooter variant="bare">
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" form={formId}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

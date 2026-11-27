import * as React from "react";
import MuiTable from "@mui/material/Table";
import MuiTableBody from "@mui/material/TableBody";
import MuiTableCell from "@mui/material/TableCell";
import MuiTableContainer from "@mui/material/TableContainer";
import MuiTableFooter from "@mui/material/TableFooter";
import MuiTableHead from "@mui/material/TableHead";
import MuiTableRow from "@mui/material/TableRow";

import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <MuiTableContainer
      component="div"
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <MuiTable
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-meta", className)}
        {...(props as React.ComponentProps<typeof MuiTable>)}
      />
    </MuiTableContainer>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <MuiTableHead
      data-slot="table-header"
      className={cn("bg-muted [&_tr]:border-b [&_tr]:border-border", className)}
      {...(props as React.ComponentProps<typeof MuiTableHead>)}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <MuiTableBody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...(props as React.ComponentProps<typeof MuiTableBody>)}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <MuiTableFooter
      data-slot="table-footer"
      className={cn(
        "border-t border-border bg-muted font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...(props as React.ComponentProps<typeof MuiTableFooter>)}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <MuiTableRow
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-none data-[state=selected]:bg-muted",
        className,
      )}
      {...(props as React.ComponentProps<typeof MuiTableRow>)}
    />
  );
}

function TableHead({ className, scope = "col", ...props }: React.ComponentProps<"th">) {
  return (
    <MuiTableCell
      {...(props as unknown as Omit<React.ComponentProps<typeof MuiTableCell>, "component" | "scope">)}
      component="th"
      data-slot="table-head"
      // 所有内置表格都是列头；显式 scope 让屏幕阅读器可靠地关联表头与单元格。
      scope={scope}
      className={cn(
        "h-11 border-0 px-4 py-2 text-left align-middle text-meta font-medium text-muted-foreground whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <MuiTableCell
      {...(props as unknown as Omit<React.ComponentProps<typeof MuiTableCell>, "component">)}
      component="td"
      data-slot="table-cell"
      className={cn(
        "h-11 border-0 px-4 py-2 align-middle text-meta text-foreground whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-meta text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};

import { ipcMain } from "electron";
import { stocktakeRepository } from "../repositories/stocktake.repository";
import { inventoryRepository } from "../repositories/inventory.repository";
import { getCurrentActor } from "./session";
import type { IpcResult } from "../../types/ipc.types";
import type {
  CommitStocktakeInput,
  StocktakeScopeInput,
} from "../../shared/stocktake";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "حصل خطأ غير متوقع" };
  }
}

export function registerStocktakeIpc(): void {
  ipcMain.handle("stocktake:categories", () =>
    handle(() => inventoryRepository.getCategories())
  );

  ipcMain.handle("stocktake:countRows", (_e, scope: StocktakeScopeInput) =>
    handle(() => stocktakeRepository.getCountRows(scope))
  );

  ipcMain.handle("stocktake:commit", (_e, input: CommitStocktakeInput) =>
    handle(() => stocktakeRepository.commitStocktake(input, getCurrentActor()))
  );

  ipcMain.handle("stocktake:getAll", () =>
    handle(() => stocktakeRepository.getStocktakes(100))
  );

  ipcMain.handle("stocktake:getById", (_e, id: number) =>
    handle(() => stocktakeRepository.getStocktakeById(id))
  );
}

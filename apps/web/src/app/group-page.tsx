"use client";

import { useEffect, useState } from "react";
import { type AccountDto, type GroupDetailResponse } from "@chorely/api-client";
import { ErrorBanner, Loading } from "../ui";
import { api } from "./api";
import { DoneList } from "./done-list";
import { errorMessage } from "./error-message";
import { GroupSettings } from "./group-settings";
import { TopBar } from "./top-bar";

export type GroupView = "done" | "settings";

/** A page of the app shell other than the Queue: the Group's Done list or its Group screen. */
export function GroupPage({ groupId, view, account }: { groupId: string; view: GroupView; account: AccountDto }) {
  const [detail, setDetail] = useState<GroupDetailResponse>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .getGroup(groupId)
      .then(setDetail)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [groupId]);

  if (!detail) return error ? <ErrorBanner message={error} /> : <Loading />;
  return (
    <>
      <TopBar title={detail.group.name} groupId={detail.group.id} />
      {view === "done" ? (
        <DoneList groupId={groupId} members={detail.members} />
      ) : (
        <GroupSettings detail={detail} account={account} onChange={setDetail} />
      )}
    </>
  );
}

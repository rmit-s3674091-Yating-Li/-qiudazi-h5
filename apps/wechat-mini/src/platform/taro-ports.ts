import Taro from "@tarojs/taro";
import type { TransportPort, KeyValuePort, UploadPort } from "../core/ports.ts";
import {
  guardedNetworkCall,
  type TrustedEndpointPolicy,
} from "../core/trusted-endpoint.ts";
import { readStorageStrict } from "../core/strict-storage-read.ts";

/**
 * An explicit endpoint policy is mandatory even for the offline PoC.
 * Configure exact trusted HTTPS origins only after domain/qualification review.
 * This adapter does not assert Supabase SDK, redirect or upload compatibility.
 */
export class TaroTransport implements TransportPort {
  constructor(private readonly endpoints: TrustedEndpointPolicy) {}
  async request<T>({
    url,
    method,
    jwt,
    data,
  }: Parameters<TransportPort["request"]>[0]): Promise<{
    status: number;
    data: T;
  }> {
    return guardedNetworkCall(this.endpoints, url, jwt, async () => {
      const result = await Taro.request<T>({
        url,
        method,
        data,
        header: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      });
      return { status: result.statusCode, data: result.data };
    });
  }
}
export class TaroKeyValue implements KeyValuePort {
  async read(key: string): Promise<unknown> {
    return readStorageStrict(key, {
      listKeys: async () => {
        const info: unknown = await Taro.getStorageInfo();
        return info && typeof info === "object" && "keys" in info
          ? info.keys
          : undefined;
      },
      readValue: async (storageKey) =>
        (await Taro.getStorage({ key: storageKey })).data,
    });
  }
  async write(key: string, value: unknown): Promise<void> {
    await Taro.setStorage({ key, data: value });
  }
  async remove(key: string): Promise<void> {
    await Taro.removeStorage({ key });
  }
}
export class TaroUpload implements UploadPort {
  constructor(private readonly endpoints: TrustedEndpointPolicy) {}
  async upload({
    url,
    localPath,
    fieldName,
    jwt,
  }: Parameters<UploadPort["upload"]>[0]): Promise<{
    status: number;
    rawBody: string;
  }> {
    return guardedNetworkCall(
      this.endpoints,
      url,
      jwt,
      async () => {
        const response = await Taro.uploadFile({
          url,
          filePath: localPath,
          name: fieldName,
          header: { Authorization: `Bearer ${jwt}` }, // multipart boundary belongs to platform
        });
        return { status: response.statusCode, rawBody: response.data };
      },
      true,
    );
  }
}

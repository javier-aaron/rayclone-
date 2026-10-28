# Audio Helper PowerShell script for Rayclone
# Windows Core Audio COM interop for endpoint enumeration and switching

param(
    [string]$Action = "List",
    [string]$DeviceId = ""
)

$code = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceCollection {
    int GetCount(out uint count);
    int Item(uint index, out IMMDevice device);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref Guid id, int clsCtx, IntPtr pActivationParams, out IntPtr aev);
    int OpenPropertyStore(int stgmAccess, out IPropertyStore properties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string strId);
    int GetState(out int state);
}

[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPropertyStore {
    int GetCount(out uint cProps);
    int GetAt(uint iProp, out IntPtr pkey);
    int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
    int SetValue(ref PROPERTYKEY key, ref PROPVARIANT propvar);
    int Commit();
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
public struct PROPERTYKEY {
    public Guid fmtid;
    public uint pid;
}

[StructLayout(LayoutKind.Explicit)]
public struct PROPVARIANT {
    [FieldOffset(0)] public short vt;
    [FieldOffset(8)] public IntPtr pszVal;
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDevEnum {}

[Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPolicyConfig {
    int GetMixFormat(string pszDeviceName, IntPtr ppFormat);
    int GetDeviceFormat(string pszDeviceName, bool bDefault, IntPtr ppFormat);
    int ResetDeviceFormat(string pszDeviceName);
    int SetDeviceFormat(string pszDeviceName, IntPtr endpointFormat, IntPtr mixFormat);
    int GetProcessingPeriod(string pszDeviceName, bool bDefault, IntPtr pmftDefaultPeriod, IntPtr pmftMinimumPeriod);
    int SetProcessingPeriod(string pszDeviceName, IntPtr pmftPeriod);
    int GetShareMode(string pszDeviceName, IntPtr pMode);
    int SetShareMode(string pszDeviceName, IntPtr pMode);
    int GetPropertyValue(string pszDeviceName, bool bFxStore, IntPtr key, IntPtr pv);
    int SetPropertyValue(string pszDeviceName, bool bFxStore, IntPtr key, IntPtr pv);
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, int role);
    int SetEndpointVisibility(string pszDeviceName, bool bVisible);
}

[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
public class CPolicyConfigClient {}

public class AudioBridge {
    private static PROPERTYKEY PKEY_Device_FriendlyName = new PROPERTYKEY {
        fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"),
        pid = 14
    };

    public static List<string> GetDevices(int dataFlow) {
        var list = new List<string>();
        try {
            var enumerator = (IMMDeviceEnumerator)new MMDevEnum();
            string defId = "";
            try {
                IMMDevice defDev;
                if (enumerator.GetDefaultAudioEndpoint(dataFlow, 1, out defDev) == 0 && defDev != null) {
                    defDev.GetId(out defId);
                }
            } catch {}

            IMMDeviceCollection coll;
            if (enumerator.EnumAudioEndpoints(dataFlow, 1, out coll) == 0 && coll != null) {
                uint count;
                coll.GetCount(out count);
                for (uint i = 0; i < count; i++) {
                    try {
                        IMMDevice dev;
                        coll.Item(i, out dev);
                        string id;
                        dev.GetId(out id);
                        IPropertyStore store;
                        dev.OpenPropertyStore(0, out store);
                        PROPVARIANT pv;
                        store.GetValue(ref PKEY_Device_FriendlyName, out pv);
                        string name = Marshal.PtrToStringUni(pv.pszVal) ?? "Audio Device";
                        bool isDef = (!string.IsNullOrEmpty(defId) && id == defId);
                        list.Add(id + "|" + name + "|" + (isDef ? "1" : "0"));
                    } catch {}
                }
            }
        } catch {}
        return list;
    }

    public static int SetDefault(string deviceId) {
        try {
            var p = (IPolicyConfig)new CPolicyConfigClient();
            p.SetDefaultEndpoint(deviceId, 0); // eConsole
            p.SetDefaultEndpoint(deviceId, 1); // eMultimedia
            p.SetDefaultEndpoint(deviceId, 2); // eCommunications
            return 0;
        } catch (Exception) {
            return -1;
        }
    }
}
"@

try {
    Add-Type -TypeDefinition $code -ErrorAction Stop
} catch {
    # Type might already be loaded in session
}

if ($Action -eq "SetDefault" -and -not [string]::IsNullOrWhiteSpace($DeviceId)) {
    $res = [AudioBridge]::SetDefault($DeviceId)
    if ($res -eq 0) {
        Write-Output "SUCCESS"
        exit 0
    } else {
        Write-Error "Failed to set default audio device"
        exit 1
    }
} else {
    $render = [AudioBridge]::GetDevices(0)
    $capture = [AudioBridge]::GetDevices(1)
    $obj = [PSCustomObject]@{
        Playback = $render
        Recording = $capture
    }
    $obj | ConvertTo-Json -Compress
}

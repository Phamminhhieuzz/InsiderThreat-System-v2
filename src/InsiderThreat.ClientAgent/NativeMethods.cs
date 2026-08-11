using System;
using System.Runtime.InteropServices;
using System.Text;

namespace InsiderThreat.ClientAgent
{
    internal static class NativeMethods
    {
        // ==========================================
        // 1. SETUPAPI (Driver Management)
        // ==========================================
        [DllImport("setupapi.dll", SetLastError = true)]
        public static extern bool SetupDiCallClassInstaller(
            UInt32 InstallFunction,
            IntPtr DeviceInfoSet,
            ref SP_DEVINFO_DATA DeviceInfoData
        );

        [DllImport("setupapi.dll", CharSet = CharSet.Auto)]
        public static extern IntPtr SetupDiGetClassDevs(
            ref Guid ClassGuid,
            [MarshalAs(UnmanagedType.LPTStr)] string? Enumerator,
            IntPtr hwndParent,
            uint Flags
        );

        [DllImport("setupapi.dll", SetLastError = true)]
        public static extern bool SetupDiEnumDeviceInfo(
            IntPtr DeviceInfoSet,
            uint MemberIndex,
            ref SP_DEVINFO_DATA DeviceInfoData
        );

        [DllImport("setupapi.dll", SetLastError = true)]
        public static extern bool SetupDiDestroyDeviceInfoList(IntPtr DeviceInfoSet);

        [DllImport("setupapi.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern bool SetupDiGetDeviceRegistryProperty(
            IntPtr DeviceInfoSet,
            ref SP_DEVINFO_DATA DeviceInfoData,
            uint Property,
            out uint PropertyRegDataType,
            StringBuilder PropertyBuffer,
            uint PropertyBufferSize,
            out uint RequiredSize
        );

        [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern bool SetupDiSetClassInstallParams(
            IntPtr DeviceInfoSet,
            ref SP_DEVINFO_DATA DeviceInfoData,
            ref SP_PROPCHANGE_PARAMS ClassInstallParams,
            uint ClassInstallParamsSize
        );

        // Constants
        public const uint DIF_PROPERTYCHANGE = 0x00000012;
        public const uint DICS_DISABLE = 0x00000002;
        public const uint DICS_ENABLE = 0x00000001;
        public const uint DICS_FLAG_GLOBAL = 0x00000001;
        public const uint DIGCF_ALLCLASSES = 0x00000004;
        public const uint DIGCF_PRESENT = 0x00000002;
        public const uint SPDRP_HARDWAREID = 0x00000001;

        [StructLayout(LayoutKind.Sequential)]
        public struct SP_DEVINFO_DATA
        {
            public uint cbSize;
            public Guid ClassGuid;
            public uint DevInst;
            public IntPtr Reserved;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct SP_CLASSINSTALL_HEADER
        {
            public uint cbSize;
            public uint InstallFunction;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct SP_PROPCHANGE_PARAMS
        {
            public SP_CLASSINSTALL_HEADER ClassInstallHeader;
            public uint StateChange;
            public uint Scope;
            public uint HwProfile;
        }

        // ==========================================
        // 2. CFGMGR32 (Ejection)
        // ==========================================
        [DllImport("cfgmgr32.dll", SetLastError = true)]
        public static extern int CM_Request_Device_EjectW(
            uint dnDevInst,
            out int pVetoType,
            StringBuilder pszVetoName,
            int ulNameLength,
            int ulFlags
        );

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        public static extern int MessageBox(IntPtr hWnd, String text, String caption, int options);
    }
}

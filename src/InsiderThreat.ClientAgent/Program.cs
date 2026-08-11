using InsiderThreat.ClientAgent;

var builder = Host.CreateApplicationBuilder(args);

if (args.Contains("--restore-usb"))
{
    Console.WriteLine("Restoring via C# disabled. Uninstaller will handle via PowerShell.");
    return;
}

builder.Services.AddHostedService<UsbService>();

var host = builder.Build();
host.Run();

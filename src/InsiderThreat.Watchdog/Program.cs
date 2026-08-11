using InsiderThreat.Watchdog;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "InsiderThreat Watchdog Service";
});

builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();

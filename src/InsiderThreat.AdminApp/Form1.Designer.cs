
namespace InsiderThreat.AdminApp
{
    partial class Form1
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            this.tmrUpdate = new System.Windows.Forms.Timer(this.components);
            this.tabControl = new System.Windows.Forms.TabControl();
            this.tabAlerts = new System.Windows.Forms.TabPage();
            this.dgvLogs = new System.Windows.Forms.DataGridView();
            this.tabUSB = new System.Windows.Forms.TabPage();
            this.dgvWhitelist = new System.Windows.Forms.DataGridView();
            this.dgvBlockedDevices = new System.Windows.Forms.DataGridView();
            this.lblWhitelist = new System.Windows.Forms.Label();
            this.lblBlocked = new System.Windows.Forms.Label();

            this.tabControl.SuspendLayout();
            this.tabAlerts.SuspendLayout();
            this.tabUSB.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.dgvLogs)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.dgvWhitelist)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.dgvBlockedDevices)).BeginInit();
            this.SuspendLayout();

            // 
            // tmrUpdate
            // 
            this.tmrUpdate.Enabled = true;
            this.tmrUpdate.Interval = 2000;

            // 
            // tabControl
            // 
            this.tabControl.Controls.Add(this.tabAlerts);
            this.tabControl.Controls.Add(this.tabUSB);
            this.tabControl.Dock = System.Windows.Forms.DockStyle.Fill;
            this.tabControl.Location = new System.Drawing.Point(0, 0);
            this.tabControl.Name = "tabControl";
            this.tabControl.SelectedIndex = 0;
            this.tabControl.Size = new System.Drawing.Size(1000, 600);
            this.tabControl.TabIndex = 0;

            // 
            // tabAlerts
            // 
            this.tabAlerts.Controls.Add(this.dgvLogs);
            this.tabAlerts.Location = new System.Drawing.Point(4, 24);
            this.tabAlerts.Name = "tabAlerts";
            this.tabAlerts.Padding = new System.Windows.Forms.Padding(3);
            this.tabAlerts.Size = new System.Drawing.Size(992, 572);
            this.tabAlerts.TabIndex = 0;
            this.tabAlerts.Text = "📋 Recent Alerts";
            this.tabAlerts.UseVisualStyleBackColor = true;

            // 
            // dgvLogs
            // 
            this.dgvLogs.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dgvLogs.Dock = System.Windows.Forms.DockStyle.Fill;
            this.dgvLogs.Location = new System.Drawing.Point(3, 3);
            this.dgvLogs.Name = "dgvLogs";
            this.dgvLogs.Size = new System.Drawing.Size(986, 566);
            this.dgvLogs.TabIndex = 0;

            // 
            // tabUSB
            // 
            this.tabUSB.Controls.Add(this.lblBlocked);
            this.tabUSB.Controls.Add(this.dgvBlockedDevices);
            this.tabUSB.Controls.Add(this.lblWhitelist);
            this.tabUSB.Controls.Add(this.dgvWhitelist);
            this.tabUSB.Location = new System.Drawing.Point(4, 24);
            this.tabUSB.Name = "tabUSB";
            this.tabUSB.Padding = new System.Windows.Forms.Padding(3);
            this.tabUSB.Size = new System.Drawing.Size(992, 572);
            this.tabUSB.TabIndex = 1;
            this.tabUSB.Text = "🔌 USB Management";
            this.tabUSB.UseVisualStyleBackColor = true;

            // 
            // lblBlocked
            // 
            this.lblBlocked.AutoSize = true;
            this.lblBlocked.Font = new System.Drawing.Font("Segoe UI", 12F, System.Drawing.FontStyle.Bold);
            this.lblBlocked.Location = new System.Drawing.Point(10, 10);
            this.lblBlocked.Name = "lblBlocked";
            this.lblBlocked.Size = new System.Drawing.Size(200, 21);
            this.lblBlocked.TabIndex = 0;
            this.lblBlocked.Text = "⛔ Blocked USB Devices";

            // 
            // dgvBlockedDevices
            // 
            this.dgvBlockedDevices.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dgvBlockedDevices.Location = new System.Drawing.Point(10, 40);
            this.dgvBlockedDevices.Name = "dgvBlockedDevices";
            this.dgvBlockedDevices.Size = new System.Drawing.Size(970, 240);
            this.dgvBlockedDevices.TabIndex = 1;

            // 
            // lblWhitelist
            // 
            this.lblWhitelist.AutoSize = true;
            this.lblWhitelist.Font = new System.Drawing.Font("Segoe UI", 12F, System.Drawing.FontStyle.Bold);
            this.lblWhitelist.Location = new System.Drawing.Point(10, 290);
            this.lblWhitelist.Name = "lblWhitelist";
            this.lblWhitelist.Size = new System.Drawing.Size(200, 21);
            this.lblWhitelist.TabIndex = 2;
            this.lblWhitelist.Text = "✅ Whitelisted Devices";

            // 
            // dgvWhitelist
            // 
            this.dgvWhitelist.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dgvWhitelist.Location = new System.Drawing.Point(10, 320);
            this.dgvWhitelist.Name = "dgvWhitelist";
            this.dgvWhitelist.Size = new System.Drawing.Size(970, 240);
            this.dgvWhitelist.TabIndex = 3;

            // 
            // Form1
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(1000, 600);
            this.Controls.Add(this.tabControl);
            this.Name = "Form1";
            this.Text = "Form1";

            this.tabControl.ResumeLayout(false);
            this.tabAlerts.ResumeLayout(false);
            this.tabUSB.ResumeLayout(false);
            this.tabUSB.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.dgvLogs)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.dgvWhitelist)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.dgvBlockedDevices)).EndInit();
            this.ResumeLayout(false);

        }

        #endregion

        private System.Windows.Forms.Timer tmrUpdate;
        private System.Windows.Forms.TabControl tabControl;
        private System.Windows.Forms.TabPage tabAlerts;
        private System.Windows.Forms.DataGridView dgvLogs;
        private System.Windows.Forms.TabPage tabUSB;
        private System.Windows.Forms.Label lblBlocked;
        private System.Windows.Forms.DataGridView dgvBlockedDevices;
        private System.Windows.Forms.Label lblWhitelist;
        private System.Windows.Forms.DataGridView dgvWhitelist;
    }
}

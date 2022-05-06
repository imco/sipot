import csv
import glob
import pandas as pd
import sys


usage = """
Usage:
  join_excel_and_csv_files.py --input_dir=str --output_file=str

Example:
  python scripts/join_excel_and_csv_files.py --input_dir=/Users/me/Documents/github/sipot/data/adjudicaciones/2020/ --output_file=/Users/me/Downloads/sipot-federal-adjudicaciones2020.csv


Input options (required):
  --input_dir=<str>    /path/to/directory/containing/raw_excel_and_csv_files/ 
  --output_file=<str>  /path/to/output_csv_filename_with_aggregated_results.csv

"""


def run_etl(input_dir, output_file):
    main_df = None

    excel_files = glob.glob(f'{input_dir}*.xls')
    excel_files.extend(glob.glob(f'{input_dir}*.xlsx'))
    csv_files = glob.glob(f'{input_dir}**/*.csv', recursive=True)

    # In some cases, Excel files were not receieved via email, so CSV files
    # were requested instead. The format for these is different.
    csv_files_clean = []
    if csv_files:
        string_to_include = 'LGT_Art_70_Fr_XXVIII'
        for cf in csv_files:
            if string_to_include in cf.split('/')[-1]:
                csv_files_clean.append(cf)

    print((
        f'Se encontraron {len(excel_files)} archivos excel y '
        f'{len(csv_files_clean)} archivos csv en el directorio {input_dir}'))

    for f in excel_files:
        df = pd.read_excel(f, header=5)
        
        # Add the 'Nombre del Sujeto Obligado' from the header
        df_meta = pd.read_excel(
            f, header=None, nrows=1, usecols=[0,1], names=['column', 'value'])
        for d in df_meta.to_dict('records'):
            df[d['column'][:-1]] = d['value']
        
        # Standardize column names
        df.columns = df.columns.str.strip().str.upper().str.replace(',', '')\
                                           .str.replace('  ', ' ')

        # Reorder the columns
        cols = list(df.columns)
        cols = [cols[0]] + cols[-1:] + cols[1:-1]
        df = df[cols]

        if main_df is None:
            main_df = df
        else:
            main_df = pd.concat([main_df, df], axis=0, ignore_index=True)

    for cfc in csv_files_clean:
        df = pd.read_csv(cfc, encoding='latin-1', skiprows=3)

        # Add the 'Nombre del Sujeto Obligado' from the header
        df_meta = pd.read_csv(
            cfc, header=None, nrows=1, usecols=[0,1], 
            names=['column', 'value'], encoding='latin-1')
        for d in df_meta.to_dict('records'):
            df[d['column'][:-1]] = d['value']
        
        # Standardize column names
        df.columns = df.columns.str.strip().str.upper()\
                                .str.replace(',', '').str.replace('  ', ' ')

        # Reorder the columns
        cols = list(df.columns)
        cols = [cols[0]] + cols[-1:] + cols[1:-1]
        df = df[cols]

        if main_df is None:
            main_df = df
        else:
            main_df = pd.concat([main_df, df], axis=0, ignore_index=True)

    # Check for duplicates and remove
    num_rows_before = len(main_df)
    main_df.drop_duplicates(keep='first', inplace=True, ignore_index=True)
    print((
        f'Se creó el DataFrame con {len(main_df)} registros y '
        f'{main_df.shape[1]} columnas. Se borraron '
        f'{num_rows_before - len(main_df)} registros duplicados.'))

    main_df.to_csv(output_file, index=False, quoting=csv.QUOTE_ALL)
    print(f'Se guardaron los resultados en {output_file}')


if __name__ == "__main__":
    args = sys.argv

    input_dir = None
    output_file = None

    if len(args) != 3:
        print(usage)
    
    else:
        for arg in args[1:]:
            if "--input_dir=" in arg:
                input_dir = arg.split('--input_dir=')[1]
                if input_dir[-1] != '/':
                    input_dir += '/'
            elif "--output_file=" in arg:
                output_file = arg.split('--output_file=')[1]
            else:
                print(f"Unknown argument '{arg}'")
                print(usage)
        if input_dir and output_file:
            print("input_dir:", input_dir)
            print("output_file:", output_file)
            run_etl(input_dir, output_file)
